import AVFoundation
import CoreMedia
import Foundation
import VideoToolbox

/// 为 macOS Aerial 锁屏生成带 temporal scalability 样本组的 HEVC 视频。
/// macOS 27 解锁过渡会读取 `tscl` / `tsas`，普通转码缺少它们时会黑屏。
enum AerialVideoEncoder {

    /// 高帧率源统一降到 30 fps。锁屏实测会自行重复播放，因此不延长时长。
    private static let maximumFrameRate: Float = 30

    private struct EncodingInput: @unchecked Sendable {
        let asset: AVURLAsset
        let track: AVAssetTrack
        let width: Int
        let height: Int
        let duration: CMTime
        let fps: Float
        let transform: CGAffineTransform
    }

    enum EncodeError: LocalizedError {
        case noVideoTrack
        case invalidDimensions
        case reader(String)
        case compression(OSStatus)
        case writer(String)
        case noFrames

        var errorDescription: String? {
            switch self {
            case .noVideoTrack: return "视频没有可用的视频轨道"
            case .invalidDimensions: return "视频尺寸无效"
            case .reader(let message): return "读取视频失败：\(message)"
            case .compression(let status): return "HEVC temporal 编码失败（\(status)）"
            case .writer(let message): return "写入 Aerial 视频失败：\(message)"
            case .noFrames: return "视频没有可编码的画面"
            }
        }
    }

    /// 重活全部放在非主执行器；输出与源视频等长、无音轨的 HEVC Main 10 MOV。
    static func encode(source: URL, destination: URL) async throws {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw EncodeError.noVideoTrack
        }
        let naturalSize = try await track.load(.naturalSize)
        let nominalFrameRate = try await track.load(.nominalFrameRate)
        let preferredTransform = try await track.load(.preferredTransform)
        let duration = try await asset.load(.duration)
        let input = EncodingInput(
            asset: asset,
            track: track,
            width: Int(naturalSize.width.rounded()),
            height: Int(naturalSize.height.rounded()),
            duration: duration,
            fps: nominalFrameRate,
            transform: preferredTransform
        )
        let writer = AerialStreamWriter(destination: destination, transform: input.transform)
        let encodingTask = Task.detached(priority: .utility) {
            try encodeSynchronously(input: input, destination: destination, writer: writer)
        }
        try await withTaskCancellationHandler {
            try await encodingTask.value
        } onCancel: {
            encodingTask.cancel()
            writer.cancel()
        }
    }

    private static func encodeSynchronously(input: EncodingInput, destination: URL, writer: AerialStreamWriter) throws {
        let asset = input.asset
        let track = input.track
        let width = input.width
        let height = input.height
        guard width > 0, height > 0 else { throw EncodeError.invalidDimensions }

        let duration = input.duration
        let seconds = CMTimeGetSeconds(duration)
        guard seconds.isFinite, seconds > 0.1 else { throw EncodeError.noFrames }
        let fps = max(1, min(input.fps > 1 ? input.fps : 24, maximumFrameRate))
        let frameInterval = CMTime(seconds: 1 / Double(fps), preferredTimescale: 60_000)
        // 实测 Aerial 播完会自行重播，产物与源时长一致即可：
        // 编码耗时和体积都只跟源片长度成正比。
        // 以约 0.8 bit/pixel 控制 HEVC Main 10 码率，1080p 约 1.66 Mbps。
        let bitrate = Int64(max(1_500_000, min(8_000_000, Double(width * height) * 0.8)))

        try? FileManager.default.removeItem(at: destination)

        let callback: VTCompressionOutputCallback = { refcon, _, status, _, sampleBuffer in
            guard status == noErr, let sampleBuffer, let refcon else {
                if let refcon {
                    Unmanaged<AerialStreamWriter>.fromOpaque(refcon)
                        .takeUnretainedValue().recordError(status)
                }
                return
            }
            Unmanaged<AerialStreamWriter>.fromOpaque(refcon)
                .takeUnretainedValue().append(sampleBuffer)
        }

        var compressionSession: VTCompressionSession?
        let pixelBufferAttributes: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange,
        ]
        let createStatus = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(width),
            height: Int32(height),
            codecType: kCMVideoCodecType_HEVC,
            encoderSpecification: [
                kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder: true,
            ] as CFDictionary,
            imageBufferAttributes: pixelBufferAttributes as CFDictionary,
            compressedDataAllocator: nil,
            outputCallback: callback,
            refcon: Unmanaged.passUnretained(writer).toOpaque(),
            compressionSessionOut: &compressionSession
        )
        guard createStatus == noErr, let compressionSession else {
            throw EncodeError.compression(createStatus)
        }
        defer {
            VTCompressionSessionInvalidate(compressionSession)
        }

        func set(_ key: CFString, _ value: CFTypeRef) throws {
            let status = VTSessionSetProperty(compressionSession, key: key, value: value)
            guard status == noErr else { throw EncodeError.compression(status) }
        }
        try set(kVTCompressionPropertyKey_RealTime, kCFBooleanFalse)
        try set(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_HEVC_Main10_AutoLevel)
        try set(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanTrue)
        try set(kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: fps))
        try set(kVTCompressionPropertyKey_MaxKeyFrameInterval, NSNumber(value: Int(fps * 5)))
        try set(kVTCompressionPropertyKey_AverageBitRate, NSNumber(value: bitrate))
        try set(kVTCompressionPropertyKey_ColorPrimaries, kCVImageBufferColorPrimaries_ITU_R_709_2)
        try set(kVTCompressionPropertyKey_TransferFunction, kCVImageBufferTransferFunction_ITU_R_709_2)
        try set(kVTCompressionPropertyKey_YCbCrMatrix, kCVImageBufferYCbCrMatrix_ITU_R_709_2)
        try set(kVTCompressionPropertyKey_AllowTemporalCompression, kCFBooleanTrue)
        try set(kVTCompressionPropertyKey_BaseLayerFrameRate, NSNumber(value: Double(fps) / 2))

        let prepareStatus = VTCompressionSessionPrepareToEncodeFrames(compressionSession)
        guard prepareStatus == noErr else { throw EncodeError.compression(prepareStatus) }

        try Task.checkCancellation()
        let reader = try AVAssetReader(asset: asset)
        defer { reader.cancelReading() }
        reader.timeRange = CMTimeRange(start: .zero, duration: duration)
        var layerConfiguration = AVVideoCompositionLayerInstruction.Configuration(assetTrack: track)
        // 保留原始像素方向；最终旋转仍由写入器的 preferredTransform 元数据完成。
        layerConfiguration.setTransform(.identity, at: .zero)
        let layerInstruction = AVVideoCompositionLayerInstruction(
            configuration: layerConfiguration
        )
        let instructionConfiguration = AVVideoCompositionInstruction.Configuration(
            backgroundColor: nil,
            enablePostProcessing: false,
            layerInstructions: [layerInstruction],
            requiredSourceSampleDataTrackIDs: [],
            timeRange: reader.timeRange
        )
        let instruction = AVVideoCompositionInstruction(configuration: instructionConfiguration)
        let compositionConfiguration = AVVideoComposition.Configuration(
            frameDuration: frameInterval,
            instructions: [instruction],
            renderSize: CGSize(width: width, height: height)
        )
        let videoComposition = AVVideoComposition(configuration: compositionConfiguration)

        let output = AVAssetReaderVideoCompositionOutput(
            videoTracks: [track],
            videoSettings: [
                kCVPixelBufferPixelFormatTypeKey as String:
                    kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange,
            ]
        )
        output.videoComposition = videoComposition
        guard reader.canAdd(output) else { throw EncodeError.reader("无法创建视频读取器") }
        reader.add(output)
        guard reader.startReading() else {
            throw EncodeError.reader(reader.error?.localizedDescription ?? "无法启动视频读取器")
        }

        var submittedFrames = 0
        var nextFrameTime = CMTime.invalid
        while let sampleBuffer = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
            let presentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            guard !nextFrameTime.isValid || CMTimeCompare(presentation, nextFrameTime) >= 0 else {
                continue
            }
            nextFrameTime = CMTimeAdd(presentation, frameInterval)
            let status = VTCompressionSessionEncodeFrame(
                compressionSession,
                imageBuffer: imageBuffer,
                presentationTimeStamp: presentation,
                duration: frameInterval,
                frameProperties: nil,
                sourceFrameRefcon: nil,
                infoFlagsOut: nil
            )
            guard status == noErr else { throw EncodeError.compression(status) }
            submittedFrames += 1
            // 分批排空编码器，限制尚未输出的帧，避免长视频持续积压。
            if submittedFrames.isMultiple(of: 8) {
                let status = VTCompressionSessionCompleteFrames(compressionSession, untilPresentationTimeStamp: .invalid)
                guard status == noErr else { throw EncodeError.compression(status) }
                try Task.checkCancellation()
            }
        }
        if reader.status == .failed {
            throw EncodeError.reader(reader.error?.localizedDescription ?? "读取失败")
        }
        guard submittedFrames > 0 else { throw EncodeError.noFrames }

        let completeStatus = VTCompressionSessionCompleteFrames(
            compressionSession,
            untilPresentationTimeStamp: .invalid
        )
        guard completeStatus == noErr else { throw EncodeError.compression(completeStatus) }
        try writer.finish()
    }
}

private final class AerialStreamWriter: @unchecked Sendable {
    private let destination: URL
    private let transform: CGAffineTransform
    /// 串行化压缩回调，但不与 `recordError` 共用：写入器背压期间不能挡住错误上报。
    private let appendLock = NSLock()
    private let lock = NSLock()
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var started = false
    private var failure: Error?
    private var appendedFrames = 0

    init(destination: URL, transform: CGAffineTransform) {
        self.destination = destination
        self.transform = transform
    }

    func cancel() {
        lock.lock()
        if failure == nil { failure = CancellationError() }
        let active = writer
        lock.unlock()
        active?.cancelWriting()
    }

    func recordError(_ status: OSStatus) {
        lock.lock()
        if failure == nil {
            failure = AerialVideoEncoder.EncodeError.compression(status)
        }
        lock.unlock()
    }

    func append(_ sampleBuffer: CMSampleBuffer) {
        appendLock.lock()
        defer { appendLock.unlock() }

        lock.lock()
        guard failure == nil, CMSampleBufferDataIsReady(sampleBuffer) else {
            lock.unlock()
            return
        }

        if !started {
            guard let format = CMSampleBufferGetFormatDescription(sampleBuffer) else {
                failure = AerialVideoEncoder.EncodeError.writer("编码器没有输出格式信息")
                lock.unlock()
                return
            }
            do {
                let newWriter = try AVAssetWriter(outputURL: destination, fileType: .mov)
                let newInput = AVAssetWriterInput(
                    mediaType: .video,
                    outputSettings: nil,
                    sourceFormatHint: format
                )
                newInput.expectsMediaDataInRealTime = false
                newInput.transform = transform
                guard newWriter.canAdd(newInput) else {
                    failure = AerialVideoEncoder.EncodeError.writer("无法添加视频轨道")
                    lock.unlock()
                    return
                }
                newWriter.add(newInput)
                guard newWriter.startWriting() else {
                    failure = AerialVideoEncoder.EncodeError.writer(
                        newWriter.error?.localizedDescription ?? "无法启动 MOV 写入"
                    )
                    lock.unlock()
                    return
                }
                newWriter.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
                writer = newWriter
                input = newInput
                started = true
            } catch {
                failure = error
                lock.unlock()
                return
            }
        }

        guard let input, let writer else {
            lock.unlock()
            return
        }
        lock.unlock()

        // 不持状态锁等待背压；每轮同时检查异步错误与 writer 状态，避免 writer 失败后
        // `isReadyForMoreMediaData` 一直为 false 而无限等待。
        let deadline = ProcessInfo.processInfo.systemUptime + 30
        while !input.isReadyForMoreMediaData {
            guard ProcessInfo.processInfo.systemUptime < deadline else {
                recordWriterFailure("等待视频写入超时")
                writer.cancelWriting()
                return
            }
            guard currentFailure() == nil else { return }
            guard writer.status == .writing else {
                recordWriterFailure(writer.error?.localizedDescription ?? "MOV 写入器已停止")
                return
            }
            usleep(5_000)
        }
        guard currentFailure() == nil else { return }
        guard writer.status == .writing else {
            recordWriterFailure(writer.error?.localizedDescription ?? "MOV 写入器已停止")
            return
        }
        guard input.append(sampleBuffer) else {
            recordWriterFailure(writer.error?.localizedDescription ?? "追加视频帧失败")
            return
        }

        lock.lock()
        appendedFrames += 1
        lock.unlock()
    }

    private func currentFailure() -> Error? {
        lock.lock()
        defer { lock.unlock() }
        return failure
    }

    private func recordWriterFailure(_ message: String) {
        lock.lock()
        if failure == nil {
            failure = AerialVideoEncoder.EncodeError.writer(message)
        }
        lock.unlock()
    }

    func finish() throws {
        lock.lock()
        let currentWriter = writer
        let currentInput = input
        let currentFailure = failure
        let frameCount = appendedFrames
        lock.unlock()

        if let currentFailure { throw currentFailure }
        guard frameCount > 0, let currentWriter, let currentInput else {
            throw AerialVideoEncoder.EncodeError.noFrames
        }
        currentInput.markAsFinished()
        let semaphore = DispatchSemaphore(value: 0)
        currentWriter.finishWriting { semaphore.signal() }
        let deadline = ProcessInfo.processInfo.systemUptime + 30
        while semaphore.wait(timeout: .now() + 0.1) == .timedOut {
            if let error = self.currentFailure() { currentWriter.cancelWriting(); throw error }
            if ProcessInfo.processInfo.systemUptime >= deadline {
                currentWriter.cancelWriting()
                throw AerialVideoEncoder.EncodeError.writer("等待视频完成写入超时")
            }
        }
        guard currentWriter.status == .completed else {
            throw AerialVideoEncoder.EncodeError.writer(
                currentWriter.error?.localizedDescription ?? "MOV 写入没有完成"
            )
        }
    }
}
