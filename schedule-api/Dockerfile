# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app
# 先拷贝依赖清单与 prisma schema，利用 Docker 层缓存
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# prisma 引擎依赖 openssl；tzdata 保证容器内时区可用
RUN apk add --no-cache openssl tzdata

# 生产依赖 + prisma client（prisma CLI 放在 dependencies 中，供启动时 db push）
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# AI 识别的临时图片目录（容器内自建，随容器生命周期回收）
RUN mkdir -p tmp
ENV TMP_DIR=/app/tmp
ENV PORT=3001

EXPOSE 3001
# 启动前同步数据库结构（幂等），再启动服务
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
