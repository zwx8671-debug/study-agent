/** @format */
import { AuthType } from '@interface/ICommon'
import { LoginUser } from '@httpdao/cocoadmin/AuthHttpDao'
import { DeviceInfo } from '@service/DeviceService'

declare module 'socket.io' {
    interface Socket {
        data: SocketData
    }

    interface RemoteSocket {
        data: SocketData
    }

    interface SocketData {
        /**
         * 用户JWT信息
         */
        user?: LoginUser
        /**
         * 设备信息
         */
        device?: {
            deviceId: string
            deviceSN: string
            deviceInfo: DeviceInfo // 增加设备详细信息
        }
        /**
         * 认证类型
         * web: 用户认证
         * client: 设备认证
         */
        authType: AuthType
        /**
         * 家庭ID，以家庭ID为房间，同步数据
         */
        spacesId: string
    }
}
