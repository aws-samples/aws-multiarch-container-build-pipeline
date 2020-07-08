import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cp from '@aws-cdk/aws-codepipeline'; // eslint-disable-line no-unused-vars
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as ecr from '@aws-cdk/aws-ecr'; // eslint-disable-line no-unused-vars

import { ArchitectureMap, DOCKER_IMAGE_NAME_FILE } from './codebuild';
import { Architecture } from './pipeline'; // eslint-disable-line no-unused-vars

const DEFAULT_COMPUTE_TYPE = cb.ComputeType.LARGE;

interface BuildManifestActionProps {
  architectures: Architecture[]

  // Compute type used for build process
  computeType?: cb.ComputeType

  // Build timeout
  timeout?: cdk.Duration

  // Source artifact
  source: cp.Artifact

  // Docker image name artifact
  dockerImages: cp.Artifact[]

  // Docker Image Tag, defaults to output of `git describe --tags --always`
  imageTag?: string

  // ECR repository
  imageRepo: ecr.Repository
}

export class BuildManifestAction extends actions.CodeBuildAction {
  constructor(scope: cdk.Construct, id: string, props: BuildManifestActionProps) {
    const project = new cb.PipelineProject(scope, 'BuildManifest', {
      buildSpec: cb.BuildSpec.fromObject(createBuildSpec(props)),
      environment: {
        buildImage: ArchitectureMap.amd64,
        computeType: props.computeType || DEFAULT_COMPUTE_TYPE,
        // Must run privileged in order to run Docker
        privileged: true
      },
      timeout: props.timeout
    });

    if (project.role) {
      props.imageRepo.grantPullPush(project.role);
    }

    const environmentVariables: { [name:string]: cb.BuildEnvironmentVariable } = {};
    if (props.imageTag) {
      environmentVariables.IMAGE_TAG = {
        value: props.imageTag
      };
    }

    super({
      actionName: 'ManifestBuilder',
      project,
      environmentVariables,
      input: props.source,
      extraInputs: props.dockerImages,
      type: actions.CodeBuildActionType.BUILD
    });
  };
}

const createBuildSpec = function(props: BuildManifestActionProps): { [key:string]:any } {
  const buildSpec = {
    version: '0.2',
    env: {
      variables: {
        DOCKER_CLI_EXPERIMENTAL: 'enabled'
      }
    },
    phases: {
      pre_build: {
        commands: [
          dockerLoginCommand()
        ]
      },
      build: {
        commands: [
          ': ${IMAGE_TAG=$(git describe --tags --always)}', // eslint-disable-line no-template-curly-in-string
          'test -n "$IMAGE_TAG"', // fail if empty
          `TAG=${props.imageRepo.repositoryUri}:$IMAGE_TAG`,
          'echo TAG: $TAG',
          ...dockerPullCommands(props),
          dockerManifestCreateCommand(props)
        ]
      },
      post_build: {
        commands: [
          'docker manifest inspect $TAG',
          'docker manifest push $TAG',
          'echo Build completed on `date`'
        ]
      }
    }
  };
  return buildSpec;
};

const dockerPullCommands = function(props: BuildManifestActionProps): string[] {
  return props.architectures.map(arch =>
    `docker pull $(cat $CODEBUILD_SRC_DIR_dockerImage_${arch}/${DOCKER_IMAGE_NAME_FILE})`
  );
};

const dockerManifestCreateCommand = function(props: BuildManifestActionProps): string {
  let command = 'docker manifest create $TAG';
  for (const arch of props.architectures) {
    command += ` --amend $(cat $CODEBUILD_SRC_DIR_dockerImage_${arch}/${DOCKER_IMAGE_NAME_FILE})`;
  }
  return command;
};

const dockerLoginCommand = function(): string {
  return `aws ecr get-login-password | docker login --username AWS --password-stdin ${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com`;
};
