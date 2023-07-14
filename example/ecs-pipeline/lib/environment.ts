export enum ApplicationEnvironment {
  // eslint-disable-next-line no-unused-vars
  TEST = 'test',
  // eslint-disable-next-line no-unused-vars
  PROD = 'prod',
}

export interface EcsApplicationEnvironmentProps {
  env: ApplicationEnvironment
}
