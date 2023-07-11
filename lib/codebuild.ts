import { IBuildImage, LinuxArmBuildImage, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';

export const ArchitectureMap: { [architecture:string]: IBuildImage } = {
  amd64: LinuxBuildImage.AMAZON_LINUX_2_3,
  arm64: LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0
};
