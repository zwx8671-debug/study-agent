/** @format */
import type { Namespace } from 'socket.io'
import { getLogger } from '@utils/Logger'

const log = getLogger('socket-io-fetch-sockets')

/** 跨节点 fetchSockets 超时（毫秒），略大于集群适配器对僵尸节点的默认心跳窗口 */
const CLUSTER_FETCH_SOCKETS_TIMEOUT_MS = 15000

function isClusterFetchSocketsTimeout(err: unknown): boolean {
    return (
        err instanceof Error &&
        (/timeout reached: missing \d+ responses/.test(err.message) ||
            /timeout reached: only \d+ responses received out of \d+/.test(err.message))
    )
}

/**
 * 在已配置 Redis 集群适配器的命名空间中，按房间拉取全部 socket（含其他节点）。
 * 若跨节点聚合超时（对端宕机、网络抖动或 Redis 异常），退化为仅本机节点，避免未处理 rejection。
 */
export async function fetchSocketsInRoomClusterSafe(namespace: Namespace, room: string) {
    try {
        return await namespace.in(room).timeout(CLUSTER_FETCH_SOCKETS_TIMEOUT_MS).fetchSockets()
    } catch (e) {
        if (isClusterFetchSocketsTimeout(e)) {
            log.warnMsg('跨节点 fetchSockets 超时，已降级为仅本机节点', {
                namespace: namespace.name,
                room,
                errorMsg: e instanceof Error ? e.message : e
            })
            return namespace.in(room).local.fetchSockets()
        }
        throw e
    }
}
