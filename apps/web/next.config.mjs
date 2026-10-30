// Same-origin module APIs use Docker service DNS, never a visitor's localhost.
const upstreams={inventory:'http://inventory-api:4200',keg:'http://keg-api:4200',social:'http://social-api:4500',ai:'http://oak-ai:4400'};
export default {
 async rewrites(){
  return {beforeFiles:Object.entries(upstreams).map(([module,upstream])=>({source:`/module-api/${module}/:path*`,destination:`${upstream}/:path*`}))};
 }
};
