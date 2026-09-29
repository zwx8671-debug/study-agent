/** @format */

import * as fs from 'fs'
import * as path from 'path'
import { path as ROOT } from 'app-root-path'
import { Project, SourceFile, SyntaxKind, Type } from 'ts-morph'

// 定义假值常量数组
const FALSE_VALUES = ['false', '0', 'no', 'n', 'off', 'null', 'undefined', 'none', '']

// 用于函数参数的通用原语类型
export type PrimitiveType = string | number | boolean | undefined
// 对象解构参数的对象形态
export type ArgObject = Record<string, PrimitiveType>
// 映射后的单个参数类型
export type MappedArg = PrimitiveType | ArgObject

// 可调用函数类型（支持 ...args）
export type Fn<R = unknown> = (...args: MappedArg[]) => R

// 函数元数据接口
export interface FunctionMeta<T extends Fn = Fn> {
    // 函数名称
    name: string
    // 函数对象
    func: T
    // 源文件
    source: SourceFile
    // 模块名称
    module: string
}

/**
 * 用于导入和管理TypeScript/JavaScript文件中的函数的工具类
 * 提供导入函数、获取JSDoc注释、签名和映射参数的方法
 * @param projectPath 项目根目录路径（默认为当前应用根目录）
 */
export class FunctionUtils {
    // 项目实例
    private readonly project: Project
    // 根路径
    private readonly rootPath: string
    // 函数元数据映射表
    private readonly funcMeta: Map<string, FunctionMeta> = new Map()
    // 项目路径到FunctionUtils实例的映射
    private static readonly instance: Map<string, FunctionUtils> = new Map()

    /**
     * 获取FunctionUtils实例
     * @param projectPath 项目路径
     * @returns 返回FunctionUtils实例
     */
    public static getInstance(projectPath: string = ROOT) {
        if (!this.instance.has(projectPath)) this.instance.set(projectPath, new FunctionUtils(projectPath))
        return this.instance.get(projectPath)!
    }

    /**
     * 构造函数
     * @param projectPath 项目路径
     */
    private constructor(projectPath: string) {
        this.rootPath = projectPath
        const tsConfigPath = path.join(this.rootPath, 'tsconfig.json')
        // 如果tsconfig.json存在，使用其配置创建项目，否则创建空项目
        if (fs.existsSync(tsConfigPath)) this.project = new Project({ tsConfigFilePath: tsConfigPath })
        else this.project = new Project()
    }

    /**
     * 从文件或目录导入所有JS/TS函数
     * @param importPath 文件或目录路径（相对于项目根目录或绝对路径）
     * @returns 导入的函数数组及其元数据
     * @throws 如果路径不存在或不是有效的JS/TS文件则抛出错误
     */
    public importFrom<T extends Fn = Fn>(importPath: string): FunctionMeta<T>[] {
        // 解析绝对路径并标准化
        const realPath = path.isAbsolute(importPath)
            ? path.normalize(importPath)
            : path.resolve(this.rootPath, importPath)

        // 检查路径是否存在
        if (!fs.existsSync(realPath)) throw new Error(`Path does not exist: ${realPath}`)

        const stat = fs.statSync(realPath)
        const files: string[] = []

        // 单个文件
        if (stat.isFile()) {
            if (this.isJsTs(realPath)) files.push(realPath)
        }
        // 目录 - 扫描JS/TS文件
        else if (stat.isDirectory()) {
            const dirFiles = fs.readdirSync(realPath)
            for (const file of dirFiles) {
                const filePath = path.join(realPath, file)
                if (fs.statSync(filePath).isFile() && this.isJsTs(filePath)) files.push(filePath)
            }
        } else throw new Error(`Path is neither file nor directory: ${realPath}`)

        const results: FunctionMeta<T>[] = []
        // 处理每个文件
        for (const file of files) {
            const moduleExports = require(file)
            const module = path.basename(file, path.extname(file))
            const source = this.getSourceFile(file)

            for (const [name, func] of Object.entries<T>(moduleExports)) {
                if (typeof func === 'function') {
                    results.push({ name, func, source, module })
                    this.funcMeta.set(name, { name, func, source, module })
                }
            }
        }

        return results
    }

    /**
     * 获取函数的JSDoc文本
     * @param funcName 函数名称
     * @param format 文档格式：'txt', 'xml', 'js', 'md'
     * @param source 源文件相对路径
     */
    public getJSDoc(
        funcName: string,
        format: 'txt' | 'xml' | 'js' | 'md' = 'txt',
        source?: SourceFile | string
    ): string {
        if (!funcName) throw new Error('Function name is empty')
        if (!source) {
            const meta = this.funcMeta.get(funcName)
            if (!meta) throw new Error(`Function not found in imported functions: ${funcName}`)
            source = meta.source
        } else if (typeof source === 'string') {
            source = this.getSourceFile(source)
        }
        const content = source
            .getFunctionOrThrow(funcName)
            .getJsDocs()
            .map(doc => doc.getInnerText().trim())
            .join('\n')

        switch (format) {
            case 'js':
                return formatAsJSDoc(content)
            case 'xml':
                return formatAsXML(content)
            case 'md':
                return formatAsMarkdown(content)
            default:
                return content
        }
    }

    /**
     * 获取带有展开联合类型的函数签名
     * @param funcName 函数名称
     * @param format 签名格式：'js'表示JavaScript风格，'xml'表示XML风格
     * @param source 源文件相对路径
     */
    public getSignature(funcName: string, format: 'js' | 'xml' = 'js', source?: string | SourceFile): string {
        if (!funcName) throw new Error('Function name is empty')
        if (!source) {
            const meta = this.funcMeta.get(funcName)
            if (!meta) throw new Error(`Function not found in imported functions: ${funcName}`)
            source = meta.source
        } else if (typeof source === 'string') {
            source = this.getSourceFile(source)
        }

        const func = source.getFunctionOrThrow(funcName)

        // 函数输入参数
        const params = func.getParameters().map(param => {
            // 处理对象解构参数 { name='name' } : { name:string }
            if (param.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern) {
                const elements = param.getNameNode().asKindOrThrow(SyntaxKind.ObjectBindingPattern).getElements()

                if (format === 'xml')
                    return elements
                        .map(e => `${e.getName()}="${e.getInitializer()?.getText().replace(/['"]/g, '') || ''}"`)
                        .join(' ')

                const paramTypeObj = param.getType()
                const props = paramTypeObj.getProperties()

                const typeText = elements
                    .map(e => {
                        const name = e.getName()
                        const type = e.getType().getNonNullableType()
                        // 直接在此位置查找属性对象并判断可选
                        const prop = props.find(p => p.getName() === name)
                        const optional = prop && prop.isOptional() ? '?' : ''
                        // 展开联合类型
                        if (type.isUnion()) return `${name}${optional}: ${this.expandUnion(type)}`
                        return `${name}${optional}: ${type.getText()}`
                    })
                    .join('; ')

                let objText = `{ ${elements.map(e => e.getText()).join(', ')} }`
                if (typeText) objText += `: { ${typeText} }`
                const initValue = param.getInitializer()?.getText() || ''
                if (initValue) objText += ` = ${initValue}`
                return objText
            }
            const name = param.getName()
            const type = param.getType().getNonNullableType()
            const value = param.getInitializer()?.getText() || ''
            if (format === 'xml') return `${name}="${value.replace(/['"]/g, '')}"`
            const optional = param.isOptional()
            return `${name}${optional ? '?' : ''}: ${type.isUnion() ? this.expandUnion(type) : type.getText()}${value ? ` = ${value}` : ''}`
        })

        if (format === 'xml') return `<${funcName} ${params.join(' ')} />`

        // 函数返回类型
        const returnType = func.getReturnType()
        const funcReturn = returnType.isVoid()
            ? ''
            : `: ${returnType.isUnion() ? this.expandUnion(returnType) : returnType.getText()}`

        return `${funcName}(${params.join(', ')})${funcReturn}`
    }

    /**
     * 将源文件中的函数参数映射到函数参数
     * @param funcName 函数名称
     * @param args 作为字符串键值对的参数
     * @param sessionAttrs
     * @param source 项目中的源文件相对路径
     * @returns 映射后的参数数组
     */
    public mapArgs(
        funcName: string,
        args: Record<string, string>,
        sessionAttrs?: Record<string, string>,
        source?: string | SourceFile
    ): Array<MappedArg | undefined> {
        if (!funcName) throw new Error('Function name is empty')
        if (!source) {
            const meta = this.funcMeta.get(funcName)
            if (!meta) throw new Error(`Function not found in imported functions: ${funcName}`)
            source = meta.source
        } else if (typeof source === 'string') {
            source = this.getSourceFile(source)
        }

        // 从源文件获取函数源码
        const func = source.getFunction(funcName)
        if (!func) return []

        // 处理函数参数
        return func.getParameters().map(param => {
            // 处理对象解构参数 { ... } : { ... }
            if (param.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern) {
                const obj: Record<string, number | boolean | string> = {}
                for (const prop of param.getType().getProperties()) {
                    const name = prop.getName()
                    const value = args[name]
                    if (!value) continue // args中找不到此属性，使用属性默认值

                    const type = prop.getTypeAtLocation(param).getNonNullableType()
                    const castValue = this.castType(value, type)
                    if (castValue !== undefined) obj[name] = castValue
                }
                return obj
            }

            // 如果args无法映射此参数，返回undefined使用默认值
            const value = args[param.getName()]
            // 如果用戶输入了sessionAttrs参数，返回sessionAttrs
            if (!value && param.getName() == 'sessionAttrs') {
                return sessionAttrs
            }
            if (!value) return undefined
            // 如果没有参数类型，返回值作为字符串
            const type = param.getType().getNonNullableType()
            return this.castType(value, type)
        })
    }

    /**
     * 将字符串值转换为指定的基本类型
     * @param value 要转换的字符串值
     * @param type 要转换到的目标类型，仅基本类型
     * @returns 转换后的值或undefined（如果无效）
     */
    private castType(value: string, type: Type): string | number | boolean | undefined {
        // 将值转换为基本类型
        if (type.isBoolean()) return !FALSE_VALUES.includes(value.toLowerCase())
        if (type.isNumber()) {
            const numValue = Number(value)
            return isNaN(numValue) ? undefined : numValue
        }
        // 这可以处理联合类型，即使是引用类型
        if (type.isUnion()) {
            if (type.getUnionTypes().every(t => t.isStringLiteral())) {
                const allowed = type.getUnionTypes().map(t => t.getLiteralValue())
                return allowed.includes(value) ? value : undefined
            }
            if (type.getUnionTypes().every(t => t.isNumberLiteral())) {
                const allowed = type.getUnionTypes().map(t => t.getLiteralValue())
                return allowed.includes(Number(value)) ? Number(value) : undefined
            }
        }

        return value
    }

    // 展开联合类型为带'|'的字符串表示
    private expandUnion(type: Type): string {
        const unionTypes = type.getUnionTypes()
        // 联合类型必须是字符串文字或数字文字，如"red" | "green" | "blue"或1 | 2 | 3
        if (unionTypes.every(t => t.isStringLiteral()))
            return unionTypes.map(t => `"${t.getLiteralValue()}"`).join(' | ')
        else if (unionTypes.every(t => t.isNumberLiteral())) return unionTypes.map(t => t.getLiteralValue()).join(' | ')

        // 或返回其原始类型文本
        return type.getText()
    }

    /**
     * 通过源路径获取或添加源文件到项目（相对或绝对）
     * 此函数将尝试查找带有.d.ts、.ts、.js扩展名的文件
     * @param sourcePath 源文件路径（带或不带扩展名，绝对或相对）
     * @throws 如果sourcePath为空或文件未找到则抛出错误
     * @returns SourceFile对象
     */
    private getSourceFile(sourcePath: string): SourceFile {
        if (!sourcePath.trim()) throw new Error('Source path is empty')

        const extensions = ['.d.ts', '.ts', '.js']

        // 转换为绝对路径
        let absPath = path.isAbsolute(sourcePath) ? path.normalize(sourcePath) : path.resolve(this.rootPath, sourcePath)
        // 移除原始扩展名
        absPath = absPath.replace(/\.(d\.ts|ts|js)$/, '')

        const relPath = path.relative(this.rootPath, absPath).replace(/\\/g, '/')

        // .d.ts > .ts > .js
        for (const ext of extensions) {
            const sourceFile = this.project.getSourceFile(`${relPath}${ext}`)
            if (sourceFile) return sourceFile
        }
        for (const ext of extensions) {
            const fullPath = `${absPath}${ext}`
            if (fs.existsSync(fullPath)) return this.project.addSourceFileAtPath(fullPath)
        }

        throw new Error(`Source file not found: ${sourcePath} (tried extensions: ${extensions.join(', ')})`)
    }

    /**
     * 验证函数是否只有基本类型参数
     * @param funcName 要验证的函数名称
     * @param sourceFile 包含函数的源文件
     * @returns 如果函数参数都是基本类型则返回true，否则返回false
     * @private
     */
    private validateParams(funcName: string, sourceFile: SourceFile): boolean {
        const func = sourceFile.getFunction(funcName)
        if (!func) return false

        // 检查每个参数
        for (const param of func.getParameters()) {
            // 处理对象解构参数
            if (param.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern) {
                // 检查解构对象中的每个属性
                for (const prop of param.getType().getProperties()) {
                    const propType = prop.getTypeAtLocation(param).getNonNullableType()
                    if (!this.isPrimType(propType)) return false
                }
            } else {
                // 处理常规参数
                const paramType = param.getType().getNonNullableType()
                if (!this.isPrimType(paramType)) return false
            }
        }

        return true
    }

    /**
     * 检查类型是否为基本类型（字符串、数字、布尔值或其联合类型）
     * @param type 要检查的类型
     * @returns 如果类型是基本类型则返回true，否则返回false
     * @private
     */
    private isPrimType(type: Type): boolean {
        // 检查基本类型
        if (type.isString() || type.isNumber() || type.isBoolean()) return true

        // 检查联合类型
        if (type.isUnion()) {
            const unionTypes = type.getUnionTypes()
            // 字符串文字联合（例如，"red" | "green" | "blue"）
            if (unionTypes.every(t => t.isStringLiteral())) return true
            // 数字文字联合（例如，1 | 2 | 3）
            if (unionTypes.every(t => t.isNumberLiteral())) return true
            // 混合基本类型联合（例如，string | number）
            if (unionTypes.every(t => t.isString() || t.isNumber() || t.isBoolean())) return true
        }

        return false
    }

    /**
     * 检查文件是否为JavaScript或TypeScript文件
     */
    private isJsTs(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase()
        return ['.js', '.ts'].includes(ext) && !filePath.endsWith('.d.ts')
    }
}

// 保持向后兼容性的静态导出
export const getFunctionUtils = (projectPath?: string) => FunctionUtils.getInstance(projectPath)

/**
 * 将内容格式化为JSDoc注释
 * @param content 要格式化的内容
 * @returns 格式化后的JSDoc注释
 */
export function formatAsJSDoc(content: string): string {
    if (!content.trim()) return ''

    const lines = content.split('\n')
    const formatted = ['/**']
    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) formatted.push(` * ${trimmed}`)
    }
    formatted.push(' */')
    return formatted.join('\n')
}

/**
 * 将内容格式化为XML注释
 * @param content 要格式化的内容
 * @returns 格式化后的XML注释
 */
export function formatAsXML(content: string): string {
    if (!content.trim()) return ''

    const trimmed = content.trim()
    return trimmed.includes('\n') ? `<!--\n${trimmed}\n-->` : `<!-- ${trimmed} -->`
}

/**
 * 将内容格式化为Markdown
 * @param content 要格式化的内容
 * @returns 格式化后的Markdown内容
 */
export function formatAsMarkdown(content: string): string {
    if (!content.trim()) return ''

    const lines = content.split('\n')
    return lines.map((line, i) => (i === 0 ? `*${line.trim()}*` : `- ${line.trim()}`)).join('\n')
}
