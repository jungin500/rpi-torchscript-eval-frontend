FROM node:14.17-buster

COPY public /usr/src/app/public
COPY sshkeys /usr/src/app/sshkeys
COPY index.js /usr/src/app
COPY package.json /usr/src/app
COPY package-lock.json /usr/src/app

WORKDIR /usr/src/app

RUN set -ex \
    \
    && npm i --save \
    && chmod 600 sshkeys/id_ecdsa \
    && mkdir uploads

EXPOSE 8080
ENTRYPOINT ["node", "index.js"]