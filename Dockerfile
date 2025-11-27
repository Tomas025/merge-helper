FROM node:20-slim

WORKDIR /app

# Copia manifestos de dependências
COPY package.json package-lock.json ./

# Instala TODAS as dependências (incluindo devDependencies, necessário para tsc)
RUN npm install

# Copia o restante do código (inclui src, s3m.jar, app.yml etc.)
COPY . .

# Compila TypeScript para ./lib
RUN npm run build

# Java (p/ s3m.jar) + Git (p/ clones/pushes) no ambiente final
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*


ENV NODE_ENV=production
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="$PATH:/usr/lib/jvm/java-17-openjdk-amd64/bin"
ENV PRIVATE_KEY_PATH=./app.private-key.pem
ENV WEBHOOK_PROXY_URL=""
ENV APP_ID=""
ENV WEBHOOK_SECRET=""
ENV GITHUB_CLIENT_ID=""
ENV GITHUB_CLIENT_SECRET=""

# Porta do Probot / servidor Express (ajuste se usar outra)
EXPOSE 3000

# APP_ID e WEBHOOK_SECRET vêm de variáveis de ambiente externas (.env ou Azure)
# Ex.: docker run --env-file .env -p 3000:3000 myapp:latest
CMD [ "npm", "start" ]
