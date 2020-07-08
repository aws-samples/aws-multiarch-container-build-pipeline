import * as cdk from '@aws-cdk/core';
import * as cb from '@aws-cdk/aws-codebuild';
import * as cp from '@aws-cdk/aws-codepipeline'; // eslint-disable-line no-unused-vars
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as ecr from '@aws-cdk/aws-ecr'; // eslint-disable-line no-unused-vars

import { ArchitectureMap, DOCKER_IMAGE_NAME_FILE } from './codebuild';

const DEFAULT_BUILD_PATH = '.';
const DEFAULT_COMPUTE_TYPE = cb.ComputeType.LARGE;
const DOCKER_IMAGE_ARTIFACT_BASEDIR = '/tmp';

interface BuildActionProps {
  arch: string,

  // Build path, in which Dockerfile lives
  buildPath?: string

  // Compute type used for build process
  computeType?: cb.ComputeType

  // Build timeout
  timeout?: cdk.Duration

  // Source artifact
  source: cp.Artifact

  // Docker image name artifact
  dockerImage: cp.Artifact

  // ECR repository
  imageRepo: ecr.Repository

  // Docker build arguments (see `--build-arg`)
  dockerBuildArgs?: {[key:string]:string}
}

export class BuildAction extends actions.CodeBuildAction {
  constructor(scope: cdk.Construct, id: string, props: BuildActionProps) {
    const project = new cb.PipelineProject(scope, `BuildProject-${props.arch}`, {
      buildSpec: cb.BuildSpec.fromObject(createBuildSpec(props)),
      environment: {
        buildImage: ArchitectureMap[props.arch],
        computeType: props.computeType || DEFAULT_COMPUTE_TYPE,
        // Must run privileged in order to run Docker
        privileged: true
      },
      timeout: props.timeout
    });

    if (project.role) {
      props.imageRepo.grantPullPush(project.role);
    }

    super({
      actionName: props.arch,
      project,
      input: props.source,
      outputs: [props.dockerImage],
      type: actions.CodeBuildActionType.BUILD
    });
  };
}

const createBuildSpec = function(props: BuildActionProps): { [key:string]:any } {
  const buildSpec = {
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          dockerLoginCommand()
        ]
      },
      build: {
        commands: [
          'TAG=$(git describe --tags --always)',
          dockerBuildCommand(props),
          dockerPushCommand(props)
        ]
      },
      post_build: {
        commands: [
          `echo ${imageTag(props)} > /${DOCKER_IMAGE_ARTIFACT_BASEDIR}/${DOCKER_IMAGE_NAME_FILE}`,
          `echo Docker image: $(cat /${DOCKER_IMAGE_ARTIFACT_BASEDIR}/${DOCKER_IMAGE_NAME_FILE})`,
          'echo Build completed on `date`'
        ]
      }
    },
    artifacts: {
      files: [DOCKER_IMAGE_NAME_FILE],
      'base-directory': DOCKER_IMAGE_ARTIFACT_BASEDIR
    }
  };
  return buildSpec;
};

const imageTag = function(props: BuildActionProps): string {
  return `${props.imageRepo.repositoryUri}:$\{TAG\}-${props.arch}`; // eslint-disable-line no-useless-escape
};

const dockerBuildCommand = function(props: BuildActionProps): string {
  const args = [
    'docker', 'build',
    '-t', imageTag(props)
  ];
  for (const [key, value] of Object.entries(props.dockerBuildArgs || {})) {
    args.push('--build-arg', `${key}=${value}`);
  }
  args.push(props.buildPath || DEFAULT_BUILD_PATH);
  return args.join(' ');
};

const dockerLoginCommand = function(): string {
  return `aws ecr get-login-password | docker login --username AWS --password-stdin ${cdk.Aws.ACCOUNT_ID}.dkr.ecr.${cdk.Aws.REGION}.amazonaws.com`;
};

const dockerPushCommand = function(props: BuildActionProps): string {
  return `docker push ${imageTag(props)}`;
};
