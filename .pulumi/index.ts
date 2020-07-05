import * as pulumi from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';
import * as k8s from '@pulumi/kubernetes';
import * as digitalocean from '@pulumi/digitalocean';
import { provider } from './provider'

const config = new pulumi.Config();

const password = config.requireSecret('dockerPassword');
export const domainName = config.require('domainName');
const appName = 'dumfan-net'

const domain = new digitalocean.Domain(appName, {
  name: domainName,
});

const image = new docker.Image(appName, {
  build: '../',
  imageName: 'dumfan/dumfan.net',
  registry: {
    username: 'benjick',
    password,
    server: 'docker.io'
  }
})

const appLabels = { app: appName };


const deployment = new k8s.apps.v1.Deployment(
  appName,
  {
    spec: {
      selector: { matchLabels: appLabels },
      replicas: 1,
      template: {
        metadata: { labels: appLabels },
        spec: {
          containers: [
            {
              name: appName,
              image: image.id,
            },
          ],
        },
      },
    },
  },
  { provider },
);

const service = new k8s.core.v1.Service(appName, {
  metadata: { labels: deployment.spec.template.metadata.labels },
  spec: {
      type: 'LoadBalancer',
      ports: [{ port: 3000, targetPort: 80, protocol: 'TCP' }],
      selector: appLabels
  }
},{ provider });

const ingress = new k8s.networking.v1beta1.Ingress(appName,
  {
    metadata: {
      labels: appLabels,
      annotations: {
        'cert-manager.io/issuer': 'letsencrypt-prod',
        'kubernetes.io/ingress.class': 'nginx',
      },
    },
    spec: {
      tls: [
        {
          hosts: [domainName],
          secretName: `${appName}-tls`
        }
      ],
      rules: [
        {
          host: domainName,
          http: {
            paths: [
              {
                path: '/',
                backend: {
                  serviceName: service.metadata.name,
                  servicePort: 'http',
                }
              },
            ],
          },
        }
      ]
    }
  },
  {provider: provider}
);
