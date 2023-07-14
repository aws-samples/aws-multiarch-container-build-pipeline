import { Aws, Duration } from 'aws-cdk-lib';
import { BuildEnvironmentVariable, BuildSpec, ComputeType, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, CodeBuildActionType } from 'aws-cdk-lib/aws-codepipeline-actions';

import { Architecture } from './pipeline';
import { ArchitectureMap } from './codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import { Repository } from 'aws-cdk-lib/aws-ecr';

const DEFAULT_COMPUTE_TYPE = ComputeType.SMALL;

export const Namespace = 'Manifest';
export const DockerImageEnvVar = 'DockerImage';

interface BuildManifestActionProps {
  architectures: Architecture[]

  // Compute type used for build process
  computeType?: ComputeType

  // Build timeout
  timeout?: Duration

  // Source artifact
  source: Artifact

  // Docker Image Tag, defaults to output of `git describe --tags --always`
  imageTag?: string

  // ECR repository
  imageRepo: Repository
}

export class BuildManifestAction extends CodeBuildAction {
  constructor(scope: Construct, id: string, props: BuildManifestActionProps) {
    const project = new PipelineProject(scope, 'BuildManifest', {
      buildSpec: BuildSpec.fromObject(createBuildSpec(props)),
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

    const environmentVariables: { [name:string]: BuildEnvironmentVariable } = {};
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
      type: CodeBuildActionType.BUILD,
      variablesNamespace: Namespace
    });
  }
}

const createBuildSpec = function(props: BuildManifestActionProps): { [key:string]:any } {
  const buildSpec = {
    version: '0.2',
    env: {
      'git-credential-helper': 'yes',
      variables: {
        DOCKER_CLI_EXPERIMENTAL: 'enabled'
      },
      'exported-variables': [
        DockerImageEnvVar
      ]
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
          `TAG=${props.imageRepo.repositoryUri}:$IMAGE_TAG`,
          'echo TAG: $TAG',
          dockerManifestCreateCommand(props)
        ],
        'on-failure': 'ABORT'
      },
      post_build: {
        commands: [
          'docker manifest inspect $TAG',
          'docker manifest push $TAG',
          `export ${DockerImageEnvVar}=$TAG`,
          'echo Build completed on `date`'
        ]
      }
    }
  };
  return buildSpec;
};

const dockerManifestCreateCommand = function(props: BuildManifestActionProps): string {
  // eslint-disable-next-line no-template-curly-in-string
  return 'docker manifest create $TAG ' + props.architectures.map(arch => '${TAG}-' + arch).join(' ');
};

const dockerLoginCommand = function(): string {
  return `aws ecr get-login-password | docker login --username AWS --password-stdin ${Aws.ACCOUNT_ID}.dkr.ecr.${Aws.REGION}.amazonaws.com`;
};
