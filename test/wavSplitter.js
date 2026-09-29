/** @format */

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { Buffer } = require('buffer')

/**
 * 将指定目录下的所有WAV文件转换为Base64编码，并生成指定格式的JSON
 * @param {string} inputDir - 存放分割后WAV文件的目录
 * @param {string} outputJsonPath - 输出的JSON文件路径
 */
async function convertWavToBase64Json(inputDir, outputJsonPath) {
    try {
        // 检查输入目录是否存在
        if (!fsSync.existsSync(inputDir)) {
            throw new Error(`输入目录不存在: ${inputDir}`)
        }

        // 读取目录下的所有文件
        const files = await fs.readdir(inputDir)

        // 筛选出WAV文件并按名称排序（确保顺序正确）
        const wavFiles = files
            .filter(file => file.toLowerCase().endsWith('.wav'))
            .sort((a, b) => {
                // 提取文件名中的数字进行排序（适用于output_001.wav这样的命名）
                const numA = parseInt(a.match(/\d+/), 10) || 0
                const numB = parseInt(b.match(/\d+/), 10) || 0
                return numA - numB
            })

        if (wavFiles.length === 0) {
            throw new Error(`在目录 ${inputDir} 中未找到WAV文件`)
        }

        // 转换每个WAV文件为Base64
        const result = []
        for (const file of wavFiles) {
            const filePath = path.join(inputDir, file)
            const fileData = await fs.readFile(filePath)

            // 转换为Base64编码
            const base64Str = fileData.toString('base64')

            // 添加到结果数组
            result.push({
                base64: base64Str,
                format: 'wav'
            })

            console.log(`已处理: ${file}`)
        }

        // 写入JSON文件
        await fs.writeFile(outputJsonPath, JSON.stringify(result, null, 2), 'utf8')

        console.log(`\n处理完成！共转换 ${wavFiles.length} 个WAV文件`)
        console.log(`JSON文件已保存至: ${outputJsonPath}`)
    } catch (error) {
        console.error(`处理失败: ${error.message}`)
        process.exit(1)
    }
}

// 配置参数
const INPUT_DIRECTORY = 'D:\\new\\Documents\\录音\\2q4s' // 存放分割后WAV文件的目录
const OUTPUT_JSON = 'D:\\new\\Documents\\录音\\wav.json' // 输出的JSON文件路径

// 执行转换
convertWavToBase64Json(INPUT_DIRECTORY, OUTPUT_JSON)
