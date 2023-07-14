#!/usr/bin/env node
import 'source-map-support/register';

import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Architecture, BuildReleasePipeline } from 'aws-multiarch-container-build-pipeline';

import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { CodeStarConnectionsSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';
import { Repository as ImageRepository } from 'aws-cdk-lib/aws-ecr';

const app = new App();

class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const imageRepo = new ImageRepository(this, 'Repository', {
      repositoryName: 'multiarch-container-build-pipeline-test'
    });

    if (!process.env.CODESTAR_CONNECTION_ARN) {
      throw new Error('CODESTAR_CONNECTION_ARN is not set');
    }

    const sourceAction = new CodeStarConnectionsSourceAction({
      connectionArn: process.env.CODESTAR_CONNECTION_ARN,
      actionName: 'Source',
      owner: 'otterley',
      repo: 'multiarch-container-build-pipeline-test',
      branch: 'main',
      codeBuildCloneOutput: true,
      output: new Artifact()
    });

    new BuildReleasePipeline(this, 'Pipeline', {
      sourceAction,
      imageRepo,
      architectures: [Architecture.Arm64, Architecture.X86_64]
    });
  }
}

new PipelineStack(app, 'SimpleMultiarchPipelineDemo');
