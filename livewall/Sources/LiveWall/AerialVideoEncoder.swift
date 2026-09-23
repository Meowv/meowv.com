import AVFoundation
import CoreMedia
import Foundation
import VideoToolbox

/// 为 macOS Aerial 锁屏生成带 temporal scalability 样本组的 HEVC 视频。
/// macOS 27 解锁过渡会读取 `tscl` / `tsas`，普通转码缺少它们时会黑屏。
enum AerialVideoEncoder {

    /// 一分钟优先缩短锁屏后的等待；高帧率源统一降到 30 fps。
    private static let targetDurationSeconds = 60.0
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

    /// 重活全部放在非主执行器；输出至少约一分钟、无音轨的 HEVC Main 10 MOV。
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
        let encodingTask = Task.detached(priority: .utility) {
            try encodeSynchronously(input: input, destination: destination)
        }
        try await withTaskCancellationHandler {
            try await encodingTask.value
        } onCancel: {
            encodingTask.cancel()
        }
    }

    private static func encodeSynchronously(input: EncodingInput, destination: URL) throws {
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
        let loops = max(1, Int(ceil(targetDurationSeconds / seconds)))
        // 桌面素材本身通常只有数 MB；Aerial 的长循环才是输出体积主因。
        // 以约 0.8 bit/pixel 控制 HEVC Main 10 码率，1080p 约 1.66 Mbps，
        // 保留约一分钟播放时长，降低锁屏时的转码等待。
        let bitrate = Int64(max(1_500_000, min(8_000_000, Double(width * height) * 0.8)))

        try? FileManager.default.removeItem(at: destination)

        let writer = AerialStreamWriter(destination: destination, transform: input.transform)
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

        var submittedFrames = 0
        for loopIndex in 0..<loops {
            try Task.checkCancellation()
            let remainingSeconds = targetDurationSeconds - Double(loopIndex) * seconds
            let loopDuration = min(seconds, remainingSeconds)
            let reader = try AVAssetReader(asset: asset)
            reader.timeRange = CMTimeRange(
                start: .zero,
                duration: CMTime(seconds: loopDuration, preferredTimescale: 60_000)
            )
            let videoComposition = AVMutableVideoComposition()
            videoComposition.frameDuration = frameInterval
            videoComposition.renderSize = CGSize(width: width, height: height)
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = reader.timeRange
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
            // 保留原始像素方向；最终旋转仍由写入器的 preferredTransform 元数据完成。
            layerInstruction.setTransform(.identity, at: .zero)
            instruction.layerInstructions = [layerInstruction]
            videoComposition.instructions = [instruction]

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

            let loopOffset = CMTimeMultiply(duration, multiplier: Int32(loopIndex))
            var nextFrameTime = CMTime.invalid
            while let sampleBuffer = output.copyNextSampleBuffer() {
                try Task.checkCancellation()
                guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
                let sourcePresentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                guard !nextFrameTime.isValid || CMTimeCompare(sourcePresentation, nextFrameTime) >= 0 else {
                    continue
                }
                let presentation = CMTimeAdd(sourcePresentation, loopOffset)
                nextFrameTime = CMTimeAdd(sourcePresentation, frameInterval)
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
            }
            if reader.status == .failed {
                throw EncodeError.reader(reader.error?.localizedDescription ?? "读取失败")
            }
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

    func recordError(_ status: OSStatus) {
        lock.lock()
        failure = AerialVideoEncoder.EncodeError.compression(status)
        lock.unlock()
    }

    func append(_ sampleBuffer: CMSampleBuffer) {
        lock.lock()
        defer { lock.unlock() }
        guard failure == nil, CMSampleBufferDataIsReady(sampleBuffer) else { return }

        if !started {
            guard let format = CMSampleBufferGetFormatDescription(sampleBuffer) else {
                failure = AerialVideoEncoder.EncodeError.writer("编码器没有输出格式信息")
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
                    return
                }
                newWriter.add(newInput)
                guard newWriter.startWriting() else {
                    failure = AerialVideoEncoder.EncodeError.writer(
                        newWriter.error?.localizedDescription ?? "无法启动 MOV 写入"
                    )
                    return
                }
                newWriter.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
                writer = newWriter
                input = newInput
                started = true
            } catch {
                failure = error
                return
            }
        }

        guard let input else { return }
        // 写入器背压时降低轮询频率，避免编码回调线程持续高频唤醒。
        while !input.isReadyForMoreMediaData, failure == nil { usleep(5_000) }
        guard failure == nil else { return }
        guard input.append(sampleBuffer) else {
            failure = AerialVideoEncoder.EncodeError.writer(
                writer?.error?.localizedDescription ?? "追加视频帧失败"
            )
            return
        }
        appendedFrames += 1
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
        semaphore.wait()
        guard currentWriter.status == .completed else {
            throw AerialVideoEncoder.EncodeError.writer(
                currentWriter.error?.localizedDescription ?? "MOV 写入没有完成"
            )
        }
    }
}
