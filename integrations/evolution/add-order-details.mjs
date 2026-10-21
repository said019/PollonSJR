/**
 * LOCAL source patch for Evolution's Baileys channel, never a deployment.
 * Usage: node add-order-details.mjs /path/to/evolution-api [--apply]
 * Default: validate anchors and report planned edits without writing.
 * Run Evolution's own build/tests before deploying a patched provider.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Pass the path to an Evolution API source checkout");
const apply = process.argv.includes("--apply");
const edits = [
  ["src/api/routes/business.router.ts", ".post(this.routerPath('getCatalog')", `.post(this.routerPath('getOrderDetails'), ...guards, async (req, res) => {
        const { orderId, token, sellerJid } = req.body || {};
        if (typeof orderId !== 'string' || !orderId || orderId.length > 100 ||
            typeof token !== 'string' || !token || token.length > 4096 ||
            typeof sellerJid !== 'string' || !/^\\d{11,15}@s\\.whatsapp\\.net$/.test(sellerJid)) {
          return res.status(400).json({ error: 'Invalid order reference' });
        }
        try {
          const instance = req.params as unknown as import('@api/dto/instance.dto').InstanceDto;
          const details = await businessController.fetchOrderDetails(instance, { orderId, token, sellerJid });
          return res.status(200).json(details);
        } catch {
          return res.status(503).json({ error: 'Order details unavailable' });
        }
      })
      .post(this.routerPath('getCatalog')`],
  ["src/api/controllers/business.controller.ts", "  public async fetchCatalog(", `  public async fetchOrderDetails({ instanceName }: InstanceDto, data: { orderId: string; token: string; sellerJid: string }) {
    const channel = this.waMonitor.waInstances[instanceName] as unknown as {
      fetchOrderDetails?: (data: { orderId: string; token: string; sellerJid: string }) => Promise<unknown>;
    };
    if (!channel?.fetchOrderDetails) throw new Error('Order details require Baileys channel');
    return channel.fetchOrderDetails(data);
  }

  public async fetchCatalog(`],
  ["src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts", "  //Business Controller", `  public async fetchOrderDetails(data: { orderId: string; token: string; sellerJid: string }) {
    // Restrict lookup to orders belonging to this connected business.
    const normalizeSeller = (jid: string) => jid.split('@')[0].replace(/:\\d+$/, '').replace(/^521(?=\\d{10}$)/, '52');
    if (!this.client?.user?.id || normalizeSeller(this.client.user.id) !== normalizeSeller(data.sellerJid)) {
      throw new Error('Seller mismatch');
    }
    const details = await this.client.getOrderDetails(data.orderId, data.token);
    // No token, customer details or downloaded images are returned or logged.
    return { products: details.products.map(product => ({ id: product.id, quantity: product.quantity })) };
  }

  //Business Controller`],
];
const changes = [];
for (const [name, anchor, replacement] of edits) {
  const path = resolve(root, name);
  const content = await readFile(path, "utf8");
  if (content.includes("fetchOrderDetails") || content.includes("routerPath('getOrderDetails')")) {
    throw new Error(`${name}: getOrderDetails already present; review manually`);
  }
  if (content.split(anchor).length !== 2) throw new Error(`${name}: upstream layout changed; no files written`);
  changes.push([path, content.replace(anchor, replacement)]);
}
for (const [path, content] of changes) {
  if (apply) await writeFile(path, content);
  process.stdout.write(`${apply ? "Updated locally" : "Would update"}: ${path}\n`);
}
