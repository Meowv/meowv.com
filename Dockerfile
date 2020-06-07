#See https://aka.ms/containerfastmode to understand how Visual Studio uses this Dockerfile to build your images for faster debugging.

FROM mcr.microsoft.com/dotnet/core/aspnet:3.1-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/core/sdk:3.1-buster AS build
WORKDIR /src
COPY ["src/Meowv.Blog.HttpApi.Hosting/Meowv.Blog.HttpApi.Hosting.csproj", "src/Meowv.Blog.HttpApi.Hosting/"]
COPY ["src/Meowv.Blog.HttpApi/Meowv.Blog.HttpApi.csproj", "src/Meowv.Blog.HttpApi/"]
COPY ["src/Meowv.Blog.Application/Meowv.Blog.Application.csproj", "src/Meowv.Blog.Application/"]
COPY ["src/Meowv.Blog.Application.Contracts/Meowv.Blog.Application.Contracts.csproj", "src/Meowv.Blog.Application.Contracts/"]
COPY ["src/Meowv.Blog.Domain.Shared/Meowv.Blog.Domain.Shared.csproj", "src/Meowv.Blog.Domain.Shared/"]
COPY ["src/Meowv.Blog.Application.Caching/Meowv.Blog.Application.Caching.csproj", "src/Meowv.Blog.Application.Caching/"]
COPY ["src/Meowv.Blog.Domain/Meowv.Blog.Domain.csproj", "src/Meowv.Blog.Domain/"]
COPY ["src/Meowv.Blog.ToolKits/Meowv.Blog.ToolKits.csproj", "src/Meowv.Blog.ToolKits/"]
COPY ["src/Meowv.Blog.BackgroundJobs/Meowv.Blog.BackgroundJobs.csproj", "src/Meowv.Blog.BackgroundJobs/"]
COPY ["src/Meowv.Blog.Swagger/Meowv.Blog.Swagger.csproj", "src/Meowv.Blog.Swagger/"]
COPY ["src/Meowv.Blog.EntityFrameworkCore/Meowv.Blog.EntityFrameworkCore.csproj", "src/Meowv.Blog.EntityFrameworkCore/"]
RUN dotnet restore "src/Meowv.Blog.HttpApi.Hosting/Meowv.Blog.HttpApi.Hosting.csproj"
COPY . .
WORKDIR "/src/src/Meowv.Blog.HttpApi.Hosting"
RUN dotnet build "Meowv.Blog.HttpApi.Hosting.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Meowv.Blog.HttpApi.Hosting.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Meowv.Blog.HttpApi.Hosting.dll"]