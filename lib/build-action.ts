import { Aws, Duration } from 'aws-cdk-lib';
import { BuildEnvironmentVariable, BuildSpec, ComputeType, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, CodeBuildActionType } from 'aws-cdk-lib/aws-codepipeline-actions';

import { ArchitectureMap } from './codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';

const DEFAULT_BUILD_PATH = '.';
const DEFAULT_COMPUTE_TYPE = ComputeType.SMALL;

interface BuildActionProps {
  arch: string,

  // Build path, in which Dockerfile lives
  buildPath?: string

  // Compute type used for build process
  computeType?: ComputeType

  // Build timeout
  timeout?: Duration

  // Source artifact
  source: Artifact

  // ECR repository
  imageRepo: Repository

  // Docker Image Tag, defaults to output of `git describe --tags --always`
  imageTag?: string

  // Docker build arguments (see `--build-arg`)
  dockerBuildArgs?: {[key:string]:string}
}

export class BuildAction extends CodeBuildAction {
  constructor(scope: Construct, id: string, props: BuildActionProps) {
    const project = new PipelineProject(scope, `BuildProject-${props.arch}`, {
      buildSpec: BuildSpec.fromObject(createBuildSpec(props)),
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

    const environmentVariables: { [name:string]: BuildEnvironmentVariable } = {};
    if (props.imageTag) {
      environmentVariables.IMAGE_TAG = {
        value: props.imageTag
      };
    }

    super({
      actionName: props.arch,
      project,
      environmentVariables,
      input: props.source,
      type: CodeBuildActionType.BUILD
    });
  }
}

const createBuildSpec = function(props: BuildActionProps): { [key:string]:any } {
  const buildSpec = {
    version: '0.2',
    env: {
      'git-credential-helper': 'yes'
    },
    phases: {
      pre_build: {
        commands: [
          dockerLoginCommand()
        ]
      },
      build: {
        commands: [
          // eslint-disable-next-line no-template-curly-in-string
          ': ${IMAGE_TAG=$(git describe --tags --always)}',
          'test -n "$IMAGE_TAG"', // fail if empty
          dockerBuildCommand(props),
          dockerPushCommand(props)
        ],
        'on-failure': 'ABORT'
      }
    }
  };
  return buildSpec;
};

const imageTag = function(props: BuildActionProps): string {
  // eslint-disable-next-line no-template-curly-in-string
  return props.imageRepo.repositoryUri + ':${IMAGE_TAG}-' + props.arch;
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
  return `aws ecr get-login-password | docker login --username AWS --password-stdin ${Aws.ACCOUNT_ID}.dkr.ecr.${Aws.REGION}.amazonaws.com`;
};

const dockerPushCommand = function(props: BuildActionProps): string {
  return `docker push ${imageTag(props)}`;
};
