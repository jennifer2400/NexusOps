export const NexusOpsConfig = {
  appName: 'NexusOps',
  appDescription: 'Infrastructure automation and deployment platform',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
  environment: process.env.NODE_ENV || 'development',
  features: {
    auth: true,
    monitoring: true,
    stackDeployments: true,
    multiTenant: false,
    billing: false,
  },
};
