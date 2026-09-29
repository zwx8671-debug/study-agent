/** @format */

import { strict as assert } from 'assert'
import { POManager } from '../../src/libs/POM/POMnager'
import { Prompt } from 'uniai'
import { readFileSync } from 'fs'
import { path as ROOT } from 'app-root-path'
import { resolve } from 'path'

const xml = readFileSync(resolve(ROOT, 'test', 'pom2', 'test.xml'), 'utf8')

export async function testPOManager() {
    const pm = new POManager(xml, {
        sn: 'ZWX001',
        productId: '01993351-c94a-7418-9d1e-821f16a55de7',
        sessionId: '019ab8f8-c1a6-75c5-baa3-0c890657c112',
        agentId: '019ab8f8-c1a9-75b5-a3aa-18d6027d10af'
    })
    const root = await pm.parse()

    assert.ok(root instanceof Prompt, 'parse() should return a Prompt')

    const md = pm.toMarkdown()
    console.log('\n[POManager] Markdown Output:\n')
    console.log(md)
    assert.ok(typeof md === 'string' && md.length > 0, 'toMarkdown should return non-empty markdown')

    console.log('\nPOManager test passed.')
}

async function main() {
    try {
        await testPOManager()
    } catch (e) {
        console.error('POManager test failed:', e)
        process.exit(1)
    }
}

if (require.main === module) {
    main()
}
