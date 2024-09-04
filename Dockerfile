FROM node:20

COPY package.json /src/package.json

RUN \
	set -x \
	&& apt-get update \
	&& apt-get install -y net-tools build-essential python3 python3-pip valgrind

RUN cd /src/; npm install

COPY . /src

EXPOSE 9000

WORKDIR /src

CMD node index.js