/** @format */
import crypto from 'crypto'

// 测试实际的JWT token 解析
const testToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzU4MjU1MzY0LCJpYXQiOjE3NTgyNTE3NjQsImp0aSI6ImJjYjVjYjczNDY4ODQ2MDNhZThmYWJmYzVhYTI3YTA3IiwidXNlcl9pZCI6IjAxOTkzYzkwLTY5OTUtNzIxOC04OWYyLTVlZDYzZWYzMzA2OSJ9.kmNSzClpuMk_3YaOG6IFWkIusfGPVq-O7RyfNduqYj4'
const secret = 'django-insecure-iue4xpaq_fqqz_cma*x%)vi(-jnprli^rn_1-wx@q7sl+z=!0t'

console.log('=== 真实 JWT Token 分析 ===\n')

const parts = testToken.split('.')
console.log('Token 结构:')
console.log('- Header:', parts[0])
console.log('- Payload:', parts[1])
console.log('- Signature:', parts[2])
console.log()

// 解析 Header
console.log('Header 解析:')
const headerBuffer = Buffer.from(parts[0], 'base64url')
const header = JSON.parse(headerBuffer.toString('utf8'))
console.log('- 算法:', header.alg)
console.log('- 类型:', header.typ)
console.log()

// 解析 Payload
console.log('Payload 解析:')
const payloadBuffer = Buffer.from(parts[1], 'base64url')
const payload = JSON.parse(payloadBuffer.toString('utf8'))
console.log('- Token类型:', payload.token_type)
console.log('- 用户ID:', payload.user_id)
console.log('- 签发时间:', new Date(payload.iat * 1000).toLocaleString())
console.log('- 过期时间:', new Date(payload.exp * 1000).toLocaleString())
console.log('- 是否过期:', Date.now() > payload.exp * 1000 ? '是' : '否')
console.log()

console.log('这个token需要使用正确的密钥才能验证签名')
console.log('算法从 header.alg 字段获取，而不是从请求头获取')

const expectedSig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url')
const isValid = parts[2] === expectedSig
console.log('原始签名:', parts[2])
console.log('期望签名:', expectedSig)
console.log('验证结果:', isValid ? '✅ 成功' : '❌ 失败')
console.log()
