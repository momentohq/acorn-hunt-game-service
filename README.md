# Acorn Hunt: Game Microservice

This microservice is responsible for tracking player activity in a game of Acorn Hunt. It uses Momento Cache and Topics to keep track of scores, movements, and super-ability uses.

## Architecture

This service uses [AWS App Runner](https://aws.amazon.com/apprunner/) to manage a containerized web service in a serverless manner. The App Runner service powering this API is defined as Infrastructure as Code (IaC) in the [Acorn Hunt repository](https://github.com/momentohq/acorn-hunt).

## Endpoints

This microservice contains the following endpoints:

* `POST /points`
* `POST /super-abilities`
* `DELETE /super-abilities`

For full API details, please [refer to the specification](/openapi.yaml).