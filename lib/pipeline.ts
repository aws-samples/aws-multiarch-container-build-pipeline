import { Artifact, Pipeline as CodePipeline, IStage, StageOptions } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, CodeStarConnectionsSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';

import { BuildAction } from './build-action';
import { BuildManifestAction } from './build-manifest';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { TestAction } from './test-action';

export enum Architecture {
  // eslint-disable-next-line no-unused-vars
  X86_64 = 'amd64',

  // eslint-disable-next-line no-unused-vars
  Arm64 = 'arm64'
}

const DEFAULT_ARCHITECTURES = [Architecture.X86_64];

interface BuildReleasePipelineProps {
  // A source action
  sourceAction: CodeBuildAction | CodeStarConnectionsSourceAction

  // ECR repository name
  imageRepo: Repository

  // architectures to build on, defaults to ['amd64']
  architectures?: Architecture[]

  // Build path, in which Dockerfile lives
  buildPath?: string

  // Docker build arguments (see `--build-arg`)
  dockerBuildArgs?: {[key:string]:string}

  // Build timeout
  buildTimeout?: Duration

  // Docker image tag, defaults to value of `git describe --tags --always` if
  // possible
  imageTag?: string

  // Test timeout
  testTimeout?: Duration

  // Location of CodeBuild build specification file for test stage, defaults to
  // 'buildspec-test.yml'
  testBuildspecPath?: string

  // Compute type used for build process
  computeType?: ComputeType
}

export class BuildReleasePipeline extends Construct {
  public pipeline: CodePipeline;

  constructor(scope: Construct, id: string, props: BuildReleasePipelineProps) {
    super(scope, id);

    let sourceArtifact: Artifact;
    const sourceArtifacts = props.sourceAction.actionProperties.outputs ?? [];
    if (sourceArtifacts.length === 1) {
      sourceArtifact = sourceArtifacts[0];
    } else {
      throw new Error('Source action must have exactly 1 output defined');
    }

    this.pipeline = new CodePipeline(this, 'pipeline', {
      restartExecutionOnUpdate: true
    });

    this.pipeline.addStage({
      stageName: 'Source',
      actions: [props.sourceAction]
    });

    const buildActions: { [arch:string]: BuildAction } = {};
    const testActions: { [arch:string]: TestAction } = {};
    const testOutputs: { [arch:string]: Artifact } = {};

    for (const arch of props.architectures || DEFAULT_ARCHITECTURES) {
      buildActions[arch] = new BuildAction(this, `BuildAction-${arch}`, {
        ...props,
        arch,
        timeout: props.buildTimeout,
        source: sourceArtifact
      });
    }

    this.pipeline.addStage({
      stageName: 'Build',
      actions: (props.architectures || DEFAULT_ARCHITECTURES).map(arch => buildActions[arch])
    });

    for (const arch of props.architectures || DEFAULT_ARCHITECTURES) {
      testOutputs[arch] = new Artifact(`test_${arch}`
        .replace(/[^A-Za-z0-9_]/g, ''));
      const action = new TestAction(this, `TestAction-${arch}`, {
        ...props,
        arch,
        timeout: props.testTimeout,
        source: sourceArtifact
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
          source: sourceArtifact
        })
      ]
    });
  }

  public addStage(props: StageOptions): IStage {
    return this.pipeline.addStage(props);
  }
}
