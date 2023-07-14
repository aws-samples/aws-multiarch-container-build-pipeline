import * as ecs from 'aws-cdk-lib/aws-ecs';

import { ARecord, CfnRecordSet, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Aspects, CfnParameter, IAspect, Stack, Tag } from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { IVpc, InstanceClass, InstanceSize, InstanceType, Port, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';

import { ApplicationEnvironment } from './environment';
import { ApplicationLoadBalancedEc2Service } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const DefaultImage = 'public.ecr.aws/nginx/nginx:1.24.0';

export interface ClusterProps {
  hostedZone: IHostedZone;
  env: ApplicationEnvironment
}

// https://github.com/aws/aws-cdk/issues/19275#issuecomment-1152860147
/**
 * Add a dependency from capacity provider association to the cluster
 * and from each service to the capacity provider association.
 */
class CapacityProviderDependencyAspect implements IAspect {
  public visit(node: IConstruct): void {
    if (node instanceof ecs.Ec2Service) {
      const children = node.cluster.node.findAll();
      for (const child of children) {
        if (child instanceof ecs.CfnClusterCapacityProviderAssociations) {
          child.node.addDependency(node.cluster);
          node.node.addDependency(child);
        }
      }
    }
  }
}

export class ClusterStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly x86Service: ecs.IService;
  public readonly arm64Service: ecs.IService;
  public readonly x86TaskDefinition: ecs.TaskDefinition;
  public readonly arm64TaskDefinition: ecs.TaskDefinition;
  public readonly x86CapacityProvider: ecs.AsgCapacityProvider;
  public readonly arm64CapacityProvider: ecs.AsgCapacityProvider;

  constructor(scope: Construct, id: string, props: ClusterProps) {
    super(scope, id);

    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      natGateways: 1
    });

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc
    });

    const image = new CfnParameter(this, 'Image', {
      default: DefaultImage
    });

    const x86ServiceInstance = new ServiceInstance(this, 'x86Instances', {
      vpc,
      domainZone: props.hostedZone,
      env: props.env,
      cluster: this.cluster,
      architecture: 'x86',
      image: image.valueAsString
    });
    this.x86CapacityProvider = x86ServiceInstance.capacityProvider;
    this.x86TaskDefinition = x86ServiceInstance.taskDefinition;
    this.x86Service = x86ServiceInstance.service;

    const x86WeightedRecord = new ARecord(this, 'x86WeightedRecord', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(x86ServiceInstance.loadBalancer)),
      zone: props.hostedZone,
      recordName: `svc.${props.env}.${props.hostedZone.zoneName}.`
    });
    (x86WeightedRecord.node.defaultChild as CfnRecordSet).weight = 100;
    (x86WeightedRecord.node.defaultChild as CfnRecordSet).setIdentifier = 'x86';

    const arm64ServiceInstance = new ServiceInstance(this, 'arm64Instances', {
      vpc,
      domainZone: props.hostedZone,
      env: props.env,
      cluster: this.cluster,
      architecture: 'arm64',
      image: image.valueAsString
    });
    this.arm64CapacityProvider = arm64ServiceInstance.capacityProvider;
    this.arm64TaskDefinition = arm64ServiceInstance.taskDefinition;
    this.arm64Service = arm64ServiceInstance.service;

    const arm64WeightedRecord = new ARecord(this, 'Arm64WeightedRecord', {
      target: RecordTarget.fromAlias(new LoadBalancerTarget(arm64ServiceInstance.loadBalancer)),
      zone: props.hostedZone,
      recordName: `svc.${props.env}.${props.hostedZone.zoneName}.`
    });
    (arm64WeightedRecord.node.defaultChild as CfnRecordSet).weight = 100;
    (arm64WeightedRecord.node.defaultChild as CfnRecordSet).setIdentifier = 'arm64';

    Aspects.of(this).add(new Tag('env', props.env));
    Aspects.of(this).add(new CapacityProviderDependencyAspect());
  }
}

interface InstanceGroupProps {
  vpc: IVpc;
  cluster: ecs.Cluster;
  architecture: 'x86' | 'arm64';
  domainZone: IHostedZone;
  env: ApplicationEnvironment;
  image: string
}

class ServiceInstance extends Construct {
  public autoScalingGroup: AutoScalingGroup;
  public capacityProvider: ecs.AsgCapacityProvider;
  public service: ecs.IService;
  public taskDefinition: ecs.TaskDefinition;
  public loadBalancer: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: InstanceGroupProps) {
    super(scope, id);

    const instanceType = props.architecture === 'x86' ? InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM) : InstanceType.of(InstanceClass.T4G, InstanceSize.MEDIUM);
    const machineImage = props.architecture === 'x86' ? ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.STANDARD) : ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM);

    this.autoScalingGroup = new AutoScalingGroup(this, 'Instances', {
      vpc: props.vpc,
      instanceType,
      machineImage,
      minCapacity: 2,
      maxCapacity: 10,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS
      }
    });
    this.autoScalingGroup.role.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role'
    });
    this.autoScalingGroup.role.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
    });
    this.autoScalingGroup.addUserData(
      `echo ECS_CLUSTER="${props.cluster.clusterName}" >> /etc/ecs/ecs.config`
    );

    this.capacityProvider = new ecs.AsgCapacityProvider(this, 'CapacityProvider', {
      autoScalingGroup: this.autoScalingGroup,
      enableManagedScaling: true
    });
    props.cluster.addAsgCapacityProvider(this.capacityProvider);

    const service = new ApplicationLoadBalancedEc2Service(this, 'Service', {
      domainName: `${props.architecture}.svc.${props.env}.${props.domainZone.zoneName}.`,
      domainZone: props.domainZone,
      cluster: props.cluster,
      cpu: 1024,
      memoryReservationMiB: 1024,
      capacityProviderStrategies: [{
        capacityProvider: this.capacityProvider.capacityProviderName,
        base: 0,
        weight: 1
      }],
      desiredCount: 2,
      publicLoadBalancer: true,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(props.image),
        containerPort: 80
      }
    });
    service.taskDefinition.addToExecutionRolePolicy(new PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage'
      ],
      resources: ['*']
    }));
    this.service = service.service;
    this.taskDefinition = service.taskDefinition;
    this.loadBalancer = service.loadBalancer;
    this.autoScalingGroup.connections.allowFrom(service.loadBalancer, Port.allTcp(), 'Allow HTTP traffic');
  }
}
