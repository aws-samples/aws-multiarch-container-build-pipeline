#!/usr/bin/env node
import 'source-map-support/register';
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';
import { getCodeStarConnectionArn, getDomainName } from '../lib/envvars';
import { ClusterStage } from '../lib/cluster';
import { ApplicationEnvironment } from '../lib/environment';
import { HostedZone } from 'aws-cdk-lib/aws-route53';

const app = new App();

class EcsPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection('aws-samples/aws-multiarch-container-build-pipeline', 'use-cdk-pipelines', {
          connectionArn: getCodeStarConnectionArn()
        }),
        env: {
          CODESTAR_CONNECTION_ARN: getCodeStarConnectionArn(),
          DOMAIN_NAME: getDomainName()
        },
        installCommands: [
          'npm i -g npm@9.5.1',
          'npm ci',
          'cd ${CODEBUILD_SRC_DIR}/example/ecs-pipeline', // eslint-disable-line no-template-curly-in-string
          'npm ci'
        ],
        commands: [
          'cd ${CODEBUILD_SRC_DIR}/example/ecs-pipeline', // eslint-disable-line no-template-curly-in-string
          'npm run build',
          'npx cdk synth'
        ],
        primaryOutputDirectory: 'example/ecs-pipeline/cdk.out'
      })
    });

    pipeline.addStage(new ClusterStage(this, 'TestCluster', {
      appEnv: ApplicationEnvironment.TEST,
      hostedZone: HostedZone.fromLookup(this, 'TestZone', {
        domainName: getDomainName()
      })
    }));
  }
}

new EcsPipelineStack(app, 'EcsPipelineStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
});

// app.synth();')

// import { App, Stack, StackProps } from 'aws-cdk-lib';
// import { Architecture, BuildReleasePipeline } from 'aws-multiarch-container-build-pipeline';
// import { Artifact, StageOptions } from 'aws-cdk-lib/aws-codepipeline';
// import { CodeStarConnectionsSourceAction, ManualApprovalAction } from 'aws-cdk-lib/aws-codepipeline-actions';
// import { getCodeStarConnectionArn, getDomainName, getGitBranch, getGitHubOwner, getGitHubRepo } from '../lib/envvars';

// import { ApplicationEnvironment } from '../lib/environment';
// import { ClusterStack } from '../lib/cluster';
// import { Construct } from 'constructs';
// import { DeployAction } from '../lib/deploy';
// import { HostedZone } from 'aws-cdk-lib/aws-route53';
// import { Repository as ImageRepository } from 'aws-cdk-lib/aws-ecr';
// import { capitalize } from 'lodash';

// const app = new App();

// class EcsPipelineStack extends Stack {
//   constructor(scope: Construct, id: string, props?: StackProps) {
//     super(scope, id, props);

//     const imageRepo = new ImageRepository(this, 'Repository', {
//       repositoryName: 'multiarch-container-build-pipeline-test-ecs'
//     });

//     const testCluster = new ClusterStack(this, 'Test', {
//       hostedZone: HostedZone.fromLookup(this, 'TestZone', {
//         domainName: getDomainName()
//       }),
//       env: ApplicationEnvironment.TEST
//     });

//     const prodCluster = new ClusterStack(this, 'Prod', {
//       hostedZone: HostedZone.fromLookup(this, 'ProdZone', {
//         domainName: getDomainName()
//       }),
//       env: ApplicationEnvironment.PROD
//     });

//     const artifact = new Artifact();

//     const sourceAction = new CodeStarConnectionsSourceAction({
//       connectionArn: getCodeStarConnectionArn(),
//       actionName: 'Source',
//       owner: getGitHubOwner(),
//       repo: getGitHubRepo(),
//       branch: getGitBranch(),
//       codeBuildCloneOutput: true,
//       output: artifact
//     });

//     const pipeline = new BuildReleasePipeline(this, 'Pipeline', {
//       sourceAction,
//       imageRepo,
//       architectures: [Architecture.Arm64, Architecture.X86_64]
//     });

//     pipeline.addStage(this.deployStage(ApplicationEnvironment.TEST, artifact, testCluster));

//     pipeline.addStage({
//       stageName: 'Approve',
//       actions: [
//         new ManualApprovalAction({
//           actionName: 'Approve'
//         })
//       ]
//     });

//     pipeline.addStage(this.deployStage(ApplicationEnvironment.PROD, artifact, prodCluster));
//   }

//   private deployStage(env: ApplicationEnvironment, artifact: Artifact, stack: ClusterStack): StageOptions {
//     const deployAction = new DeployAction(this, `DeployTo${capitalize(env)}Env`, {
//       stack,
//       input: artifact
//     });

//     return {
//       stageName: `DeployTo${capitalize(env)}`,
//       actions: [deployAction]
//     };
//   }
// }

// new EcsPipelineStack(app, 'MultiArchECSPipelineDemo', {
//   env: {
//     region: process.env.CDK_DEFAULT_REGION,
//     account: process.env.CDK_DEFAULT_ACCOUNT
//   }
// });
