import { Namespace as BuildManifestNamespace, DockerImageEnvVar } from '../../../lib/build-manifest';
import { BuildSpec, ComputeType, LinuxArmBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';

import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Stack } from 'aws-cdk-lib';

const ChangeSetName = 'DeployImageUpdate';

export interface DeployProps {
  input: Artifact;
  stack: Stack;
}

export class DeployAction extends CodeBuildAction {
  constructor(scope: Construct, id: string, props: DeployProps) {
    const project = new PipelineProject(scope, id, {
      environment: {
        buildImage: LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
        computeType: ComputeType.SMALL
      },
      buildSpec: buildBuildSpec(props)
    });
    project.addToRolePolicy(new PolicyStatement({
      actions: ['cloudformation:UpdateStack', 'cloudformation:CreateChangeSet', 'cloudformation:DescribeChangeSet', 'cloudformation:ExecuteChangeSet', 'cloudformation:DeleteChangeSet', 'cloudformation:DescribeStacks'],
      resources: [props.stack.formatArn({
        service: 'cloudformation',
        resource: 'stack',
        resourceName: props.stack.stackName + '/*'
      })]
    }));

    super({
      actionName: 'Deploy',
      project,
      input: props.input,
      environmentVariables: {
        IMAGE: {
          value: `#{${BuildManifestNamespace}.${DockerImageEnvVar}}`
        }
      }
    });
  }
}

function buildBuildSpec(props: DeployProps): BuildSpec {
  return BuildSpec.fromObject({
    version: '0.2',
    phases: {
      build: {
        commands: [
          'exitcode=0',
          `aws cloudformation create-change-set --capabilities CAPABILITY_IAM --stack-name ${props.stack.stackName} --use-previous-template --parameters ParameterKey=Image,ParameterValue=$IMAGE --change-set-name ${ChangeSetName}`,
          `if aws cloudformation wait change-set-create-complete --stack-name ${props.stack.stackName} --change-set-name ${ChangeSetName}; then
             echo "Deploying changes"
             aws cloudformation execute-change-set --stack-name ${props.stack.stackName} --change-set-name ${ChangeSetName}
             aws cloudformation wait stack-update-complete --stack-name ${props.stack.stackName}
           else
             reason=$(aws cloudformation describe-change-set --stack-name ${props.stack.stackName} --change-set-name ${ChangeSetName} --query 'StatusReason' --output text)
             if echo $reason | grep -q "didn't contain changes"; then
               echo "No changes to deploy"
             else
               echo "Error creating change set"
               exitcode=1
             fi
           fi`,
          `aws cloudformation delete-change-set --stack-name ${props.stack.stackName} --change-set-name ${ChangeSetName} || :`,
          'exit $exitcode'
        ]
      }
    }
  });
}
