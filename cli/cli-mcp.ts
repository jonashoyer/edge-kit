import {
  DependencyResolver,
  FeatureRegistry,
  featureBundleToXml,
  featureListToXml,
} from './mcp-utils.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error('Usage:');
    console.error('  npx tsx cli/cli-mcp.ts list');
    console.error('  npx tsx cli/cli-mcp.ts get <feature_id>');
    process.exit(1);
  }

  const registry = new FeatureRegistry();
  const resolver = new DependencyResolver();

  await registry.init();

  if (command === 'list') {
    const features = registry.list();
    console.log(featureListToXml(features));
    return;
  }

  if (command === 'get') {
    const featureId = args[1];
    if (!featureId) {
      console.error('Error: Missing feature ID');
      process.exit(1);
    }

    const feature = registry.get(featureId);
    if (!feature) {
      console.error(`Error: Feature "${featureId}" not found.`);
      console.error('Available features:');
      registry.list().forEach((f) => console.error(`- ${f.id}`));
      process.exit(1);
    }

    const bundle = resolver.resolve(feature.entryPoint);
    bundle.feature = feature;

    console.log(featureBundleToXml(bundle));
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main();
