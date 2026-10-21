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
    <EnableTrimAnalyzer>true</EnableTrimAnalyzer>
    <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>
    <NuGetAudit>false</NuGetAudit>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.12" />
    <Compile Include="$project_dir/tests/RuntimeChecks.cs" />
    <Compile Include="$project_dir/tests/ModuleInitializationChecks.cs" />
    <Compile Include="$project_dir/tests/FfmpegPathChecks.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Core/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Infrastructure/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Security/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Auth/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Diagnostics/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Health/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiCameraOptions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiCameraServiceCollectionExtensions.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiModuleRuntime.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiCredentialCache.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiPlaybackTicketService.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiFfmpegResolver.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiMediaProfile.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/XiaomiStorageJsonContext.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/XiaomiCamera/Cloud/XiaomiCloudCredentials.cs" />
  </ItemGroup>
</Project>
EOF
# 仅使用本机包缓存，不为检查下载依赖。
dotnet restore "$work_dir/Checks.csproj" --source "$work_dir/empty-feed" --ignore-failed-sources --verbosity quiet
DOTNET_USE_POLLING_FILE_WATCHER=1 dotnet run --project "$work_dir/Checks.csproj" --no-restore --verbosity quiet
