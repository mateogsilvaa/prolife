import { startServer } from './app.js'
import { lanAddresses } from './config.js'

const { port, baseDir, remote } = await startServer()
console.log(`\n  prolife · servidor local`)
console.log(`  http://127.0.0.1:${port}`)
if (remote) {
  for (const { address, vpn } of lanAddresses()) {
    console.log(`  http://${address}:${port}${vpn ? '  (vale también fuera de casa)' : ''}`)
  }
}
console.log(`  datos → ${baseDir}\n`)
