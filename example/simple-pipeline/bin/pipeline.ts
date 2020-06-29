#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Pipeline, Architecture } from 'aws-multiarch-container-build-pipeline';
import { Artifact } from '@aws-cdk/aws-codepipeline';
import * as ecr from '@aws-cdk/aws-ecr';
import { S3SourceAction } from '@aws-cdk/aws-codepipeline-actions';
import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3';
import * as cb from '@aws-cdk/aws-codebuild';

const app = new cdk.App();

class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imageRepo = new ecr.Repository(this, 'Repository');
    const bucket = new Bucket(this, 'SourceBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      versioned: true
    });

    new cb.Project(this, 'SourceProject', {
      source: cb.Source.gitHub({
        owner: 'otterley',
        repo: 'multiarch-container-build-pipeline-test',
        webhook: true
      }),
      artifacts: cb.Artifacts.s3({
        bucket,
        name: 'source.zip',
        includeBuildId: false,
        packageZip: true,
        encryption: true
      }),
      buildSpec: cb.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          post_build: {
            commands: [
              'echo completed on `date`'
            ]
          }
        },
        artifacts: {
          files: [
            '**/*'
          ]
        }
      })
    });

    const sourceAction = new S3SourceAction({
      actionName: 'S3',
      bucket,
      bucketKey: 'source.zip',
      output: new Artifact()
    });

    new Pipeline(this, 'Pipeline', {
      sourceAction,
      imageRepo,
      architectures: [Architecture.Arm64, Architecture.X86_64]
    });
  }
}

new PipelineStack(app, 'Stack');
