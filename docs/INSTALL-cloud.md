![Melba](https://prismic-io.s3.amazonaws.com/foodmeup-landing/a3222f3f-c3ae-479a-bbe0-e0849a783ad5_melba-byfmu.svg)

# Summary

- [On AWS](#on-aws)
  - [Create Security Groups](#create-security-groups)
  - [Create an EC2 Instance](#create-an-ec2-instance)
  - [Route 53](#route-53)
  - [CloudFront](#cloudfront)
- [Installation and configuration of Disourse](#installation-and-configuration-of-disourse)
  - [Requirements](#requirements)
  - [Reverse proxy (on the discourse instance)](#reverse-proxy-on-the-discourse-instance)
    - [Installation - Reverse proxy](#installation-of-reverse-proxy)
    - [Setup - Reverse proxy](#setup-of-reverse-proxy)
  - [Discourse](#discourse)
    - [Requirements - Discourse](#requirements-of-discourse)
    - [Installation - Discourse](#installation-of-discourse)
    - [Setup - Discourse](#setup-of-discourse)
- [Add a new language](#add-a-new-language)

# On AWS

## Create Security Groups:

We'll create new security groups to allow HTTP, HTTPS, and the new SSH port (36987)

#### HTTP
- <u>Security group name</u>: allow-http-from-all
- <u>Inbound rules</u> --> Add rule
  - <u>Type</u>: HTTP
  - <u>Port range</u>: 80
  - <u>Source</u>: 0.0.0.0/0

- <u>Outbound rules</u>:
  Keep default values (allow for all)

#### HTTPS
- <u>Security group name</u>: allow-https-from-all
- <u>Inbound rules</u> --> Add rule
  - <u>Type</u>: HTTPS
  - <u>Port range</u>: 443
  - <u>Source</u>: 0.0.0.0/0

- <u>Outbound rules</u>:
  Keep default values (allow for all)

#### SSH (22)
- <u>Security group name</u>: allow-ssh-default
- <u>Inbound rules</u> --> Add rule
  - <u>Type</u>: SSH
  - <u>Port range</u>: 22
  - <u>Source</u>: 0.0.0.0/0

- <u>Outbound rules</u>:
  Keep default values (allow for all)

#### SSH (36987)
- <u>Security group name</u>: allow-ssh-from-all-on-port-36987
- <u>Inbound rules</u> --> Add rule
  - <u>Type</u>: Custom TCP
  - <u>Port range</u>: 36987
  - <u>Source</u>: 0.0.0.0/0

- <u>Outbound rules</u>:
  Keep default values (allow for all)

#### OUTPUT
- <u>Security group name</u>: output-to-all
- <u>Inbound rules</u>:
  Nothing
- <u>Outbound rules</u>:
  Keep default values (allow for all)

## Create an EC2 Instance:

- Create an EC2 instance with Alpine image:
  - <u>Choose AMI</u>: <b>alpine-ami-3.14.2-x86_64-r0</b> in Community AMIs
  - <u>Choose Instance Type</u>: <b>t3.small</b> minimum
  - <u>Configure Instance</u>: Keep all default values
  - <u>Add Storage</u>: Size: <b>50Go</b>, Volume Type: <b>gp3</b>
  - <u>Add tags</u>: None
  - <u>Configure Security Group</u>: <b>allow-ssh-default, allow-http-from-all,	allow-https-from-all, allow-ssh-from-all-on-port-36987, output-to-all</b>
  - <u>Review Instance Launch</u>


## Route 53:

- Add a new DNS A record contain the IP adress of the instance previously created.
<u>Record name</u>: forum.melba.io

## CloudFront:

- Add forum.melba.io as a new origin

- Add 2 behaviours with the followings parameters:
	- Path pattern: /fr/forum
    - Origin: forum.melba.io
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Cache policy name: Managed-CachingDisabled
    - Origin request policy name: Managed-AllViewer
- Second one:
	- Path pattern: /fr/forum/*
    - Origin: forum.melba.io
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Cache policy name: Managed-CachingDisabled
    - Origin request policy name: Managed-AllViewer


# Installation and configuration of Disourse

## Requirements

### SSH
- Connect with SSH on the discourse instance previously created.

`ssh -i fmu.pem alpine@13.38.63.6`

`sudo -s` to pass root

- Change the ssh port in `/etc/ssh/sshd_config`. Put <b>36987</b> value for the new port

- Restart SSH

- Reconnect with SSH with new port on discourse instance:

`ssh -i fmu.pem alpine@13.38.63.6 -p 36987`

`sudo -s` to pass root

## Reverse proxy (on the discourse instance)

### Installation of reverse proxy

`apk update`

`apk add nginx vim`

### Setup of reverse proxy

- Copy content of /etc/nginx/http.d/default.conf

`rc-update add nginx default`

`rc-service nginx start`


## Discourse

### Requirements of Discourse

- The Docker package is in the 'Community' repository.

`apk add docker git`

- To start the Docker daemon at boot

`rc-update add docker boot`

`service docker start`

Source: https://wiki.alpinelinux.org/wiki/Docker


### Installation of Discourse

- Create Discourse directory:

`mkdir /var/discourse-fr`
 
- Clone official Docker Discourse image in /var/discourse.

`git clone https://github.com/discourse/discourse_docker.git /var/discourse-fr`
 
### Setup of Discourse

`cd /var/discourse-fr`
 
- Launch installation script

`./discourse-setup`

- Answer the following questions when prompted:

```
Hostname for your Discourse? [melba.io]: 
Email address for admin account(s)? [paul-louis.bautes@foodmeup.io]: 
SMTP server address? [email-smtp.eu-west-3.amazonaws.com]: 
SMTP port? [587]: 
SMTP user name? [user@example.com]: 
SMTP password? [pa$$word]: 
Let's Encrypt account email? (ENTER to skip) [me@example.com]: 
Optional Maxmind License key () [xxxxxxxxxxxxxxxx]:
```

- Delete `container/app.yaml`and get the `app-fr-yaml` file on the the repository.


- Then `./launcher rebuild app-fr`


# Add a new language

## On CloudFront:

- Add 2 behaviours with the followings parameters:
	- Path pattern: /en/forum
    - Origin: forum.melba.io
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Cache policy name: Managed-CachingDisabled
    - Origin request policy name: Managed-AllViewer
- Second one:
	- Path pattern: /en/forum/*
    - Origin: forum.melba.io
    - Viewer protocol policy: Redirect HTTP to HTTPS
    - Cache policy name: Managed-CachingDisabled
    - Origin request policy name: Managed-AllViewer

## On the reverse proxy:

- Add an upstream:

```
upstream forum-en {
     server localhost:8082; ### THE NEW PORT OF THE FUTURE CONTAINER
}
```

- In the `server` section add the 2 followings locations:

```
      location /en/forum {
      proxy_pass http://forum-en;
      }

      location /en/forum/ {
      proxy_pass http://forum-en;
      }
```

- Reload nginx

## On Discourse

- Repeat the intallation steps and create a new app file `app-en.yaml` instead of `app-fr.yaml`

- Edit it and modify the "fr" terms:

- Then `./launcher rebuild app-en`
