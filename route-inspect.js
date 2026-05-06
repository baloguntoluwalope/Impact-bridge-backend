const app = require('./src/app');
const routes = [];
app._router.stack.forEach((layer) => {
  if (layer.route) {
    routes.push({ path: layer.route.path, methods: Object.keys(layer.route.methods).join(',') });
  } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
    layer.handle.stack.forEach((s) => {
      if (s.route) {
        routes.push({ path: '/api/v1' + s.route.path, methods: Object.keys(s.route.methods).join(',') });
      }
    });
  }
});
console.log(JSON.stringify(routes.filter(r => r.path.includes('ai-verification')), null, 2));
