FROM ubuntu:16.04
MAINTAINER Chris Troutner <chris.troutner@gmail.com>

#Update the OS and install any OS packages needed.
RUN apt-get update
RUN apt-get install -y sudo iputils-ping

#Create the user 'connextcms' and add them to the sudo group.
RUN useradd -ms /bin/bash p2pvps
RUN adduser p2pvps sudo

#Set password to 'password' change value below if you want a different password
RUN echo p2pvps:password | chpasswd

#Set the working directory to be the connextcms home directory
WORKDIR /home/p2pvps

#Install KeystoneJS Dependencies
RUN apt-get update
RUN apt-get install -y git curl nano

#Install Node and NPM
RUN curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt-get install -y nodejs build-essential

# Create app directory
WORKDIR /home/p2pvps

# Clone the p2pvps-server2 repo
RUN git clone https://github.com/P2PVPS/listing-manager
WORKDIR /home/p2pvps/listing-manager
RUN git checkout unstable
RUN npm install


# If you are building your code for production
# RUN npm install --only=production


VOLUME /home/p2pvps/logs
VOLUME /home/p2pvps/auth

#EXPOSE 3434
#CMD [ "npm", "start" ]

#Dummy app just to get the container running with docker-compose.
#You can then enter the container with command: docker exec -it <container ID> /bin/bash
RUN npm install express
COPY dummyapp.js dummyapp.js
CMD ["node", "dummyapp.js"]
