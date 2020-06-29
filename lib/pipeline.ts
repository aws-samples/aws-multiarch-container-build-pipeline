import * as cdk from '@aws-cdk/core';
import * as cp from '@aws-cdk/aws-codepipeline';
import * as cb from '@aws-cdk/aws-codebuild'; // eslint-disable-line no-unused-vars
import * as actions from '@aws-cdk/aws-codepipeline-actions'; // eslint-disable-line no-unused-vars
import * as ecr from '@aws-cdk/aws-ecr'; // eslint-disable-line no-unused-vars

import { BuildAction } from './build-action';
import { TestAction } from './test-action';
import { BuildManifestAction } from './build-manifest';

export enum Architecture {
  // eslint-disable-next-line no-unused-vars
  X86_64 = 'amd64',

  // eslint-disable-next-line no-unused-vars
  Arm64 = 'arm64'
}

const DEFAULT_ARCHITECTURES = [Architecture.X86_64];

interface PipelineProps {
  // A source action
  sourceAction: actions.BitBucketSourceAction | actions.CodeBuildAction | actions.GitHubSourceAction | actions.S3SourceAction

  // ECR repository name
  imageRepo: ecr.Repository

  // architectures to build on, defaults to ['amd64']
  architectures?: Architecture[]

  // Build path, in which Dockerfile lives
  buildPath?: string

  // Docker build arguments (see `--build-arg`)
  dockerBuildArgs?: {[key:string]:string}

  // Build timeout
  buildTimeout?: cdk.Duration

  // Test timeout
  testTimeout?: cdk.Duration

  // Location of CodeBuild build specification file for test stage, defaults to
  // 'buildspec-test.yml'
  testBuildspecPath?: string

  // Compute type used for build process
  computeType?: cb.ComputeType
}

export class Pipeline extends cdk.Construct {
  public pipeline: cp.Pipeline;

  constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
    super(scope, id);

    let sourceArtifact: cp.Artifact;
    const sourceArtifacts = props.sourceAction.actionProperties.outputs || [];
    if (sourceArtifacts.length === 1) {
      sourceArtifact = sourceArtifacts[0];
    } else {
      throw new Error('Source action must have exactly 1 output defined');
    }

    this.pipeline = new cp.Pipeline(this, 'pipeline', {
      restartExecutionOnUpdate: true
    });

    this.pipeline.addStage({
      stageName: 'Source',
      actions: [props.sourceAction]
    });

    const buildActions: { [arch:string]: BuildAction } = {};
    const dockerImageArtifacts: { [arch:string]: cp.Artifact } = {};
    const testActions: { [arch:string]: TestAction } = {};
    const testOutputs: { [arch:string]: cp.Artifact } = {};

    for (const arch of props.architectures || DEFAULT_ARCHITECTURES) {
      dockerImageArtifacts[arch] = new cp.Artifact(`dockerImage_${arch}`
        .replace(/[^A-Za-z0-9_]/g, ''));
      buildActions[arch] = new BuildAction(this, `BuildAction-${arch}`, {
        ...props,
        arch,
        timeout: props.buildTimeout,
        source: sourceArtifact,
        dockerImage: dockerImageArtifacts[arch]
      });
    }

    this.pipeline.addStage({
      stageName: 'Build',
      actions: (props.architectures || DEFAULT_ARCHITECTURES).map(arch => buildActions[arch])
    });

    for (const arch of props.architectures || DEFAULT_ARCHITECTURES) {
      testOutputs[arch] = new cp.Artifact(`test_${arch}`
        .replace(/[^A-Za-z0-9_]/g, ''));
      const action = new TestAction(this, `TestAction-${arch}`, {
        ...props,
        arch,
        timeout: props.testTimeout,
        source: sourceArtifact,
        dockerImage: dockerImageArtifacts[arch]
      });
      testActions[arch] = action;
    }

    this.pipeline.addStage({
      stageName: 'Test',
      actions: (props.architectures || DEFAULT_ARCHITECTURES).map(arch => testActions[arch])
    });

    this.pipeline.addStage({
      stageName: 'BuildManifest',
      actions: [
        new BuildManifestAction(this, 'BuildManifest', {
          ...props,
          architectures: props.architectures || DEFAULT_ARCHITECTURES,
          dockerImages: Object.keys(dockerImageArtifacts).map(k => dockerImageArtifacts[k]),
          source: sourceArtifact
        })
      ]
    });
  }
}
