<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IconEraser, IconNetwork } from '@tabler/icons-vue';
import { remoteServices } from '@/features/tools/config/remoteServices';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolHelp from '@/features/tools/components/ToolHelp.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import {
  analyzeIp,
  calculateCidr,
  convertIpv4,
  convertIpv6,
  networkLookup,
  parseNetworkInput,
} from './network-utils';

type Mode =
  | 'ip'
  | 'ipv4'
  | 'ipv6'
  | 'cidr'
  | 'dns-query'
  | 'dns-lookup'
  | 'url'
  | 'headers'
  | 'status'
  | 'mime';
const props = defineProps<{ mode: Mode }>();
const input = ref('');
const recordType = ref('A');
const output = ref('');
const error = ref('');
const processing = ref(false);
let controller: AbortController | null = null;

const details = computed(
  () =>
    ({
      ip: ['IP 地址查看', '输入 IPv4 或 IPv6，识别类型和地址属性。', '192.168.1.10'],
      ipv4: ['IPv4 转换', '在点分地址、整数、十六进制和二进制之间转换。', '192.168.1.10'],
      ipv6: ['IPv6 转换', '展开、压缩 IPv6 并查看二进制段。', '2001:db8::1'],
      cidr: ['CIDR 计算器', '计算 IPv4 网段、掩码、广播地址与主机范围。', '192.168.1.10/24'],
      'dns-query': ['DNS 记录查询', '通过 DNS over HTTPS 查询真实 DNS 记录。', 'meowv.com'],
      'dns-lookup': ['DNS Lookup', '通过 DNS over HTTPS 查询域名解析结果。', 'meowv.com'],
      url: [
        'URL 解析',
        '拆分 URL 的协议、主机、路径和查询参数。',
        'https://studio.meowv.com/tools?from=home#network',
      ],
      headers: [
        'HTTP Header 查看',
        '解析响应状态行和重复 Header。',
        'HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store',
      ],
      status: ['HTTP 状态码查询', '查询常见 HTTP 状态码的含义。', '404'],
      mime: ['MIME 类型查询', '根据文件扩展名或 MIME 类型反向查询。', '.json'],
    })[props.mode],
);

interface DnsJsonResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean;
  CD?: boolean;
  Question?: Array<{ name: string; type: number }>;
  Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
  Authority?: Array<{ name: string; type: number; TTL: number; data: string }>;
  Comment?: string;
}

const DNS_STATUS: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

async function queryDns(): Promise<Record<string, unknown>> {
  const domain = input.value.trim().replace(/\.$/, '');
  if (!domain) throw new Error('请输入要查询的域名。');
  if (/[/\\\s]/.test(domain)) throw new Error('请输入域名，不要包含协议、路径或空格。');
  controller?.abort();
  controller = new AbortController();
  const timeout = window.setTimeout(() => controller?.abort('timeout'), remoteServices.dns.timeoutMs);
  try {
    const endpoint = new URL('/dns-query', remoteServices.dns.origin);
    endpoint.searchParams.set('name', domain);
    endpoint.searchParams.set('type', recordType.value);
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/dns-json' },
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DNS 服务返回 HTTP ${response.status}。`);
    const data = (await response.json()) as DnsJsonResponse;
    const statusName = DNS_STATUS[data.Status] ?? `RCODE_${data.Status}`;
    if (data.Status === 3) throw new Error(`NXDOMAIN：${domain} 不存在。`);
    if (data.Status !== 0) throw new Error(`DNS 查询失败：${statusName}。`);
    return {
      domain,
      recordType: recordType.value,
      status: statusName,
      answers: data.Answer ?? [],
      authority: data.Authority ?? [],
      authenticatedData: Boolean(data.AD),
      provider: remoteServices.dns.provider,
      comment: data.Comment ?? null,
    };
  } catch (cause) {
    if (controller?.signal.aborted) throw new Error('DNS 查询已取消或超时。');
    throw cause;
  } finally {
    window.clearTimeout(timeout);
    controller = null;
  }
}

async function run(): Promise<void> {
  error.value = '';
  processing.value = true;
  try {
    let result: Record<string, unknown>;
    if (props.mode === 'ip') result = analyzeIp(input.value);
    else if (props.mode === 'ipv4') result = convertIpv4(input.value);
    else if (props.mode === 'ipv6') result = convertIpv6(input.value);
    else if (props.mode === 'cidr') result = calculateCidr(input.value);
    else if (props.mode === 'status' || props.mode === 'mime')
      result = networkLookup(props.mode, input.value);
    else if (props.mode === 'dns-query' || props.mode === 'dns-lookup') result = await queryDns();
    else result = parseNetworkInput(props.mode, input.value, recordType.value);
    output.value = JSON.stringify(result, null, 2);
  } catch (cause) {
    output.value = '';
    error.value = cause instanceof Error ? cause.message : '网络数据处理失败。';
  } finally {
    processing.value = false;
  }
}

function clear(): void {
  input.value = '';
  output.value = '';
  error.value = '';
}

onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="tool-workspace-grid">
    <ToolSection :title="details[0]" :description="details[1]"
      ><div class="tool-stack">
        <ToolInput
          v-model="input"
          label="输入"
          :placeholder="details[2]"
          :rows="mode === 'headers' ? 10 : 5"
        />
        <label v-if="mode === 'dns-query' || mode === 'dns-lookup'" class="tool-field"
          ><span>记录类型</span
          ><select v-model="recordType">
            <option
              v-for="type in ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA', 'SOA']"
              :key="type"
            >
              {{ type }}
            </option>
          </select></label
        >
        <ToolActions
          ><button type="button" class="tool-button tool-button--primary" :disabled="processing" @click="run">
            <IconNetwork :size="16" aria-hidden="true" />{{ processing ? '查询中…' : '查询' }}</button
          ><button type="button" class="tool-button tool-button--quiet" @click="input = details[2]">
            使用示例</button
          ><button type="button" class="tool-button tool-button--danger" @click="clear">
            <IconEraser :size="16" aria-hidden="true" />清空
          </button></ToolActions
        >
        <p v-if="error" class="tool-status tool-status--error" role="alert">{{ error }}</p>
      </div></ToolSection
    >
    <ToolOutput
      :title="`${details[0]}结果`"
      :value="output"
      filename="network-result.json"
      mime-type="application/json;charset=utf-8"
    />
  </div>
  <ToolHelp
    :steps="['输入要查询或分析的网络数据。', '选择 DNS 记录类型并发起查询。', '检查、复制或下载结果。']"
    :note="
      mode.startsWith('dns-')
        ? 'DNS 查询会把域名和记录类型发送到 Cloudflare DNS；Studio 不会记录查询内容。'
        : '输入内容只在浏览器本地处理。'
    "
  />
</template>
