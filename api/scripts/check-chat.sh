#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd "$(dirname "$0")" && pwd)
project_dir=$(cd "$script_dir/.." && pwd)
if [ "${1:-}" = '--help' ] || [ "${1:-}" = '-h' ]; then
  echo '用法：scripts/check-chat.sh；在临时项目和数据库中验证 Chat REST、WebSocket、匿名认证、限流、管理及持久化，不构建完整 API。'
  exit 0
fi
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/meowv-chat-check.XXXXXX")
# 保留临时项目，便于检查失败后的诊断；不访问运行数据库。
mkdir -p "$work_dir/empty-feed"
cat >"$work_dir/Checks.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems><UseAppHost>false</UseAppHost><UseSharedCompilation>false</UseSharedCompilation>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors><EnableConfigurationBindingGenerator>true</EnableConfigurationBindingGenerator>
    <EnableRequestDelegateGenerator>true</EnableRequestDelegateGenerator><EnableTrimAnalyzer>true</EnableTrimAnalyzer>
    <JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault><NuGetAudit>false</NuGetAudit>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="10.0.12" />
    <Compile Include="$project_dir/tests/ChatChecks.cs" />
    <Compile Include="$project_dir/src/Meowv.Api.Core/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Infrastructure/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Security/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Chat/*.cs" />
    <Compile Include="$project_dir/src/Meowv.Api/Modules/Health/*.cs" />
  </ItemGroup>
</Project>
XML
dotnet restore "$work_dir/Checks.csproj" --source "$work_dir/empty-feed" --ignore-failed-sources --verbosity quiet
DOTNET_USE_POLLING_FILE_WATCHER=1 dotnet run --project "$work_dir/Checks.csproj" --no-restore --verbosity quiet
