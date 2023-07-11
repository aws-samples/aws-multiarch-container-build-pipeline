# AWS Multi-Architecture Container Build Pipeline Library

## Introduction

This repository contains an [AWS Cloud Development Kit
(CDK)](https://docs.aws.amazon.com/cdk/latest/guide/home.html) pattern library
to help you create code pipelines that build multi-architecture container
images. This can help you build container images that run on both x86
(Intel/AMD) and arm64 architectures, allowing you to better utilize the growing
portfolio of Amazon EC2 instance families.

The [AWS Graviton processor family](https://aws.amazon.com/ec2/graviton/) uses
the Arm 64-bit (arm64) architecture. It provides up to 40% better
price/performance vs. comparable X86-based compute. Many applications are easily
adaptable to the arm64 architecture by simply recompiling the code. Programs
written in scripting languages such as JavaScript, Ruby, and Python, and
applications based on compiled byte code, such as Java and .NET, can usually be
run without any modification by using a native arm64 runtime such as [Amazon
Corretto](https://aws.amazon.com/corretto/).

The Docker Image Manifest V2 specification allows container image repositories,
including [Amazon ECR](https://aws.amazon.com/ecr/), to host images for multiple
architectures. This allows you to run `docker pull` on a host and automatically
receive the correct image for the host's CPU architecture. This pipeline library
takes advantage of this functionality by constructing the multi-architecture
manifest for you.

## Theory of operation

This library builds a pipeline using [AWS
CodePipeline](https://aws.amazon.com/codepipeline/) to produce an
easily-accessible multi-architecture Docker image in [Amazon
ECR](https://aws.amazon.com/ecr/).

The pipeline stages are as follows:

1. Source stage: obtain the source code for the Docker image.
2. Build stage: the architecture-specific container images are built in
   parallel.
3. Test stage: the architecture-specific container images are tested in
   parallel.
4. Manifest build stage: the multi-architecture image manifest is produced and
   pushed to Amazon ECR.

## Usage

First, you'll need to build an application using AWS CDK. Download the library
and import it into your CDK application:

```sh
$ npm install aws-multiarch-container-build-pipeline
```

```ts
import { Pipeline, Architecture } from 'aws-multiarch-container-build-pipeline';
```

### Source action

Your application will need to create a CodePipeline source action. Many of the
source actions provided by the [aws-codepipeline-actions
library](https://docs.aws.amazon.com/cdk/api/latest/docs/aws-codepipeline-actions-readme.html)
are supported, including AWS CodeCommit, BitBucket, and GitHub. BitBucket and
GitHub are supported **only** via the
[`CodeStarConnectionsSourceAction`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_codepipeline_actions.CodeStarConnectionsSourceAction.html)
class. In the source action properties, ensure `codeBuildCloneOutput` is set to
`true`.

Here's a simple example:

```ts
const sourceAction = new CodeStarConnectionsSourceAction({
   connectionArn: process.env.CODESTAR_CONNECTION_ARN,
   actionName: 'Source',
   owner: 'mycompany',
   repo: 'myapp',
   branch: 'main',
   // ensure this is set to `true` or CodeBuild won't be able to run `git` commands
   codeBuildCloneOutput: true,
   output: new Artifact()
});
```

### ECR repository

Your application will need to create an ECR repository or reference an existing
repository.

To create a new one:

```ts
const imageRepo = new ecr.Repository(this, 'MyAppImageRepo');
```

To reference an existing repository, you can use one of the static
`fromRepository*` methods available in the [Repository
class](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecr.Repository.html). Here's an example:

```ts
const ecrRepo = ecr.Repository.fromRepositoryName(this, 'MyAppImageRepo', myapp);
```

### Construct the pipeline

Then, your application can construct the pipeline:

```ts
new Pipeline(this, 'Pipeline', {
    sourceAction: s3Source,
    imageRepo: ecrRepo,
    architectures: [Architecture.Arm64, Architecture.X86_64]
});
```

The following attributes can be passed to the pipeline constructor:

| Attribute           | Description                                                                                                                                                                   | Required? |
|---------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|
| `sourceAction`      | A CodePipeline source action. Tells the pipeline where to get the source code and is used as the source stage.                                                                | Yes       |
| `imageRepo`         | An ECR image repository. Used for storing and fetching images and manifests.                                                                                                  | Yes       |
| `architectures`     | Array of CPU architectures used for building and testing images. Defaults to `amd64`. Supported values include `amd64` and `arm64`.                                           |           |
| `buildPath`         | Path inside repository in which `Dockerfile` is located. Defaults to `.`.                                                                                                     |           |
| `dockerBuildArgs`   | Optional map of Docker build args. Equivalent to passing `--build-arg` to `docker build`.                                                                                     |           |
| `imageTag`          | Tag to apply to generated images. Defaults to output of `git describe --tags --always`. You can use CodePipeline variable substitutions here, such as `'#{Source.CommitId}'`. |           |
| `buildTimeout`      | Build timeout                                                                                                                                                                 |           |
| `testTimeout`       | Test timeout                                                                                                                                                                  |           |
| `testBuildSpecPath` | Location of CodeBuild buildspec path used for test stage inside repository. Defaults to `./buildspec-test.yml`.                                                               |           |

## Example

An example of a minimal CDK application that uses this library can be found in
the [example](example/) folder of this repository.

## License

MIT
