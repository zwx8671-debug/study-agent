/** @format */

import crypto from 'crypto'

/**
 * 公私钥演示程序，非对称加密，coco出厂设置
 */
console.log('=== Crypto 演示程序 ===\n')

// 1. 生成 RSA 公私钥对
console.log('1. 生成 RSA 公私钥对')
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
})

console.log('公钥:\n', publicKey)
console.log('私钥:\n', privateKey)

// 2. 加密和解密演示
console.log('\n2. 加密和解密演示')
const data = 'Hello, this is a secret message!'
console.log('原始数据:', data)

// 使用公钥加密
const encrypted = crypto.publicEncrypt(publicKey, Buffer.from(data))
console.log('加密后数据:', encrypted.toString('base64'))

// 使用私钥解密
const decrypted = crypto.privateDecrypt(privateKey, encrypted)
console.log('解密后数据:', decrypted.toString())

// 3. 签名和验签演示
console.log('\n3. 签名和验签演示')

// 使用私钥签名
const signature = crypto.sign('sha256', Buffer.from(data), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING
})

console.log('生成的签名:', signature.toString('base64'))

// 使用公钥验签
const isVerified = crypto.verify(
    'sha256',
    Buffer.from(data),
    {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING
    },
    signature
)

console.log('验签结果:', isVerified ? '有效签名' : '无效签名')

// 4. 对称加密演示
console.log('\n4. AES 对称加密演示')

// 生成随机密钥和初始化向量
const algorithm = 'aes-256-cbc'
const key = crypto.randomBytes(32)
const iv = crypto.randomBytes(16)

// 加密
const cipher = crypto.createCipheriv(algorithm, key, iv)
let encryptedData = cipher.update('这是对称加密的测试数据', 'utf8', 'hex')
encryptedData += cipher.final('hex')
console.log('AES加密后:', encryptedData)

// 解密
const decipher = crypto.createDecipheriv(algorithm, key, iv)
let decryptedData = decipher.update(encryptedData, 'hex', 'utf8')
decryptedData += decipher.final('utf8')
console.log('AES解密后:', decryptedData)

console.log('\n=== 演示完成 ===')
