FROM mcr.microsoft.com/dotnet/aspnet:5.0-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build
WORKDIR /src
COPY ["src/Meowv.Blog.Api/Meowv.Blog.Api.csproj", "src/Meowv.Blog.Api/"]
COPY ["src/Meowv.Blog.BackgroundWorkers/Meowv.Blog.BackgroundWorkers.csproj", "src/Meowv.Blog.BackgroundWorkers/"]
COPY ["src/Meowv.Blog.Core/Meowv.Blog.Core.csproj", "src/Meowv.Blog.Core/"]
COPY ["src/Meowv.Blog.Response/Meowv.Blog.Response.csproj", "src/Meowv.Blog.Response/"]
COPY ["src/Meowv.Blog.Application/Meowv.Blog.Application.csproj", "src/Meowv.Blog.Application/"]
COPY ["src/Meowv.Blog.MongoDb/Meowv.Blog.MongoDb.csproj", "src/Meowv.Blog.MongoDb/"]
RUN dotnet restore "src/Meowv.Blog.Api/Meowv.Blog.Api.csproj"
COPY . .
WORKDIR "/src/src/Meowv.Blog.Api"
RUN dotnet build "Meowv.Blog.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Meowv.Blog.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Meowv.Blog.Api.dll"]