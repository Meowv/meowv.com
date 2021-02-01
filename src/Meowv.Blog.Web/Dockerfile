FROM mcr.microsoft.com/dotnet/aspnet:5.0-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build
WORKDIR /src
COPY ["src/Meowv.Blog.Web/Meowv.Blog.Web.csproj", "src/Meowv.Blog.Web/"]
COPY ["src/Meowv.Blog.Response/Meowv.Blog.Response.csproj", "src/Meowv.Blog.Response/"]
RUN dotnet restore "src/Meowv.Blog.Web/Meowv.Blog.Web.csproj"
COPY . .
WORKDIR "/src/src/Meowv.Blog.Web"
RUN dotnet build "Meowv.Blog.Web.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Meowv.Blog.Web.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Meowv.Blog.Web.dll"]