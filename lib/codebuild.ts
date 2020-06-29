import * as cb from '@aws-cdk/aws-codebuild';

export const ArchitectureMap: { [architecture:string]: cb.IBuildImage } = {
  amd64: cb.LinuxBuildImage.AMAZON_LINUX_2_3,
  arm64: cb.LinuxBuildImage.AMAZON_LINUX_2_ARM
};

export const DOCKER_IMAGE_NAME_FILE = 'dockerImage';
