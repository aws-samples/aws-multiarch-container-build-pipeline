import * as cdk from '@aws-cdk/core'; // eslint-disable-line no-unused-vars
import * as cb from '@aws-cdk/aws-codebuild';
import * as cp from '@aws-cdk/aws-codepipeline'; // eslint-disable-line no-unused-vars
import * as actions from '@aws-cdk/aws-codepipeline-actions';
import * as ecr from '@aws-cdk/aws-ecr'; // eslint-disable-line no-unused-vars
import { ArchitectureMap } from './codebuild';

const DEFAULT_BUILDSPEC_PATH = 'buildspec-test.yml';
const DEFAULT_COMPUTE_TYPE = cb.ComputeType.LARGE;

interface TestActionProps {
  arch: string,

  // Compute type used for test process
  computeType?: cb.ComputeType

  // Location of buildspec file for test stage, defaults to 'buildspec-test.yml'
  buildspecPath?: string

  // Build timeout
  timeout?: cdk.Duration

  // Source artifact
  source: cp.Artifact

  // Docker image name output
  dockerImage: cp.Artifact

  // ECR repository
  imageRepo: ecr.Repository
}

export class TestAction extends actions.CodeBuildAction {
  constructor(scope: cdk.Construct, id: string, props: TestActionProps) {
    const project = new cb.PipelineProject(scope, `TestProject-${props.arch}`, {
      buildSpec: cb.BuildSpec.fromSourceFilename(props.buildspecPath || DEFAULT_BUILDSPEC_PATH),
      environment: {
        buildImage: ArchitectureMap[props.arch],
        computeType: props.computeType || DEFAULT_COMPUTE_TYPE,
        // Must run privileged in order to run Docker
        privileged: true
      },
      timeout: props.timeout
    });

    if (project.role) {
      props.imageRepo.grantPull(project.role);
    }

    super({
      actionName: props.arch,
      project,
      input: props.source,
      extraInputs: [props.dockerImage],
      type: actions.CodeBuildActionType.BUILD
    });
  };
}
