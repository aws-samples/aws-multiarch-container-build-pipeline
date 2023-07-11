import { BuildSpec, ComputeType, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { CodeBuildAction, CodeBuildActionType } from 'aws-cdk-lib/aws-codepipeline-actions';

import { ArchitectureMap } from './codebuild';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { Construct } from 'constructs';
import { Duration } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';

const DEFAULT_BUILDSPEC_PATH = 'buildspec-test.yml';
const DEFAULT_COMPUTE_TYPE = ComputeType.LARGE;

interface TestActionProps {
  arch: string,

  // Compute type used for test process
  computeType?: ComputeType

  // Location of buildspec file for test stage, defaults to 'buildspec-test.yml'
  buildspecPath?: string

  // Build timeout
  timeout?: Duration

  // Source artifact
  source: Artifact

  // ECR repository
  imageRepo: Repository
}

export class TestAction extends CodeBuildAction {
  constructor(scope: Construct, id: string, props: TestActionProps) {
    const project = new PipelineProject(scope, `TestProject-${props.arch}`, {
      buildSpec: BuildSpec.fromSourceFilename(props.buildspecPath || DEFAULT_BUILDSPEC_PATH),
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
      type: CodeBuildActionType.BUILD
    });
  };
}
