#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd "$(dirname "$0")" && pwd)
project_dir=$(cd "$script_dir/.." && pwd)
if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  echo '用法：scripts/check-runtime.sh；在临时项目中运行配置、模块故障隔离、代理限流、授权和持久化定向检查，不构建完整 API。'
  exit 0
fi
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/meowv-api-runtime.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$work_dir/empty-feed"
cat >"$work_dir/Checks.csproj" <<EOF
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <UseAppHost>false</UseAppHost><UseSharedCompilation>false</UseSharedCompilation>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnableConfigurationBindingGenerator>true</EnableConfigurationBindingGenerator>
    <EnableRequestDelegateGenerator>true</EnableRequestDelegateGenerator>
    <EnableTrimAnalyzer>false</EnableTrimAnalyzer>
    <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>
    <NuGetAudit>false</NuGetAudit>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.12" />
    <Compile Include="$project_dir/tests/RuntimeChecks.cs" />
    <Compile Include="$project_dir/tests/Usings.Runtime.cs" />
    <Compile Include="$project_dir/tests/MusicChecks.cs" />
    <Compile Include="$project_dir/tests/NeteaseSourceChecks.cs" />
    <Compile Include="$project_dir/tests/MusicUpstreamFixture.cs" />
    <Compile Include="$project_dir/tests/MusicAggregationChecks.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Music/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Chat/*.cs" />
    <Content Include="$project_dir/tests/fixtures/music-v1.json" Link="music-v1.json" CopyToOutputDirectory="PreserveNewest" />
    <Compile Include="$project_dir/tests/ModuleInitializationChecks.cs" />
    <Compile Include="$project_dir/tests/FfmpegPathChecks.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.SharedKernel/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Platform/Infrastructure/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Platform/Hosting/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Platform/Security/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.Auth/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.Chat/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.Diagnostics/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.Health/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.Music/**/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Configuration/XiaomiCameraOptions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Configuration/XiaomiModuleOptions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Configuration/XiaomiMediaOptions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Configuration/XiaomiCameraServiceCollectionExtensions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Domain/XiaomiPlaybackLimits.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Domain/XiaomiPlaybackCapacityException.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/XiaomiModuleRuntime.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Api/XiaomiEndpointMetadata.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/XiaomiModuleAvailabilityMiddleware.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/XiaomiCredentialCache.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Application/XiaomiPlaybackTicketService.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Domain/XiaomiPlaybackTarget.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/XiaomiFfmpegResolver.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/XiaomiMediaProfile.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Api/XiaomiStorageJsonContext.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Modules.XiaomiCamera/Infrastructure/Cloud/XiaomiCloudCredentials.cs" />
    <Compile Remove="$project_dir/src/**/obj/**/*.cs" />
    <Compile Remove="$project_dir/src/**/bin/**/*.cs" />
    <!-- 禁用模块的控制器不纳入定向测试宿主（占位服务不具备完整契约）；主工程完整编译覆盖。 -->
  </ItemGroup>
</Project>
EOF
# 仅使用本机包缓存，不为检查下载依赖。
dotnet restore "$work_dir/Checks.csproj" --source "$work_dir/empty-feed" --ignore-failed-sources --verbosity quiet
DOTNET_USE_POLLING_FILE_WATCHER=1 dotnet run --project "$work_dir/Checks.csproj" --no-restore --verbosity quiet
