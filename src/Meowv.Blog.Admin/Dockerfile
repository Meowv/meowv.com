FROM mcr.microsoft.com/dotnet/aspnet:5.0-buster-slim AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:5.0-buster-slim AS build
WORKDIR /src
COPY ["src/Meowv.Blog.Admin/Meowv.Blog.Admin.csproj", "src/Meowv.Blog.Admin/"]
COPY ["src/Meowv.Blog.Response/Meowv.Blog.Response.csproj", "src/Meowv.Blog.Response/"]
RUN dotnet restore "src/Meowv.Blog.Admin/Meowv.Blog.Admin.csproj"
COPY . .
WORKDIR "/src/src/Meowv.Blog.Admin"
RUN dotnet build "Meowv.Blog.Admin.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Meowv.Blog.Admin.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Meowv.Blog.Admin.dll"]