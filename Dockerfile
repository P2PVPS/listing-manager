FROM ubuntu:16.04
MAINTAINER Chris Troutner <chris.troutner@gmail.com>

#Update the OS and install any OS packages needed.
RUN apt-get update
RUN apt-get install -y sudo

#Create the user 'connextcms' and add them to the sudo group.
RUN useradd -ms /bin/bash p2pvps
RUN adduser p2pvps sudo

#Set password to 'password' change value below if you want a different password
RUN echo p2pvps:password | chpasswd

#Set the working directory to be the connextcms home directory
WORKDIR /home/p2pvps

#Install KeystoneJS Dependencies
RUN apt-get update
RUN apt-get install -y git
RUN apt-get install -y curl
RUN apt-get install -y nano

#Install Node and NPM
RUN curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt-get install -y nodejs
RUN apt-get install -y build-essential

# Create app directory
#WORKDIR /usr/src/app
WORKDIR /home/p2pvps

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
#COPY package*.json ./
#RUN npm install

# Clone the p2pvps-server2 repo
RUN git clone https://github.com/P2PVPS/listing-manager
WORKDIR /home/p2pvps/listing-manager
RUN npm install


# If you are building your code for production
# RUN npm install --only=production

# Bundle app source
#COPY . .

#RUN pwd
#VOLUME /usr/src/app/logs
#VOLUME /usr/src/app/auth
RUN mkdir /home/p2pvps/auth
RUN mkdir /home/p2pvps/logs
VOLUME /home/p2pvps/logs
VOLUME /home/p2pvps/auth

EXPOSE 3434
#CMD [ "npm", "start" ]

#Dummy app just to get the container running with docker-compose.
#You can then enter the container with command: docker exec -it <container ID> /bin/bash
RUN npm install express
COPY dummyapp.js dummyapp.js
CMD ["node", "dummyapp.js"]
