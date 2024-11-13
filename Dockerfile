FROM node:20

# 작업 디렉토리 설정
WORKDIR /app

# package.json 파일을 먼저 복사하고 npm install 실행
COPY LINKODE_MEDIA/package*.json ./

RUN \
    set -x \
    && apt-get update \
    && apt-get install -y net-tools build-essential python3 python3-pip valgrind \
    && npm install

# 나머지 파일 복사
COPY LINKODE_MEDIA/* ./

# 포트 노출
EXPOSE 9000

# 앱 실행
CMD ["node", "server.js"]