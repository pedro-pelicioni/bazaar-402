<div align="center">

# PREGÃO

**A camada de descoberta nativa em Stellar para APIs pagas via x402.**
*The Stellar-native discovery layer for x402 paid APIs.*

Agentes anunciam. Agentes descobrem. Agentes pagam. Tudo em um round-trip HTTP.

`Apache-2.0` · `stellar:testnet` · Stellar Summit SP 2026 — sub-lane 3A, Agentic Payments (x402 / MPP)

</div>

---

> **pregão** *(s.m., pt-BR)* — o grito do leiloeiro que anuncia um lote; também a sessão de
> negociação em um mercado. Um mercado só existe quando alguém consegue **ouvir** o que está
> à venda.

## O problema

Em Stellar, o **pagamento** x402 está resolvido. O pacote Apache-2.0 [`@x402/stellar`](https://www.npmjs.com/package/@x402/stellar)
(v2.21.0, publicado em 04/ago/2026) entrega `verify` e `settle` para o scheme `exact`, a
spec [`scheme_exact_stellar.md`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_stellar.md)
está estável, e a SDF já publicou um facilitator de exemplo.

A **descoberta**, não. E sem descoberta um agente não tem como saber *o que* pagar.

- A spec [`specs/extensions/bazaar.md`](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md)
  define `/discovery/resources` e `/discovery/search` — mas é só spec.
- O pacote `@x402/extensions/bazaar` diz explicitamente, no próprio README, que entrega
  **apenas helpers de client e server e nenhuma implementação de catálogo/índice do lado
  facilitator**.
- A issue [`stellar/x402-stellar#50` — *Explore Bazaar support for Stellar*](https://github.com/stellar/x402-stellar/issues/50)
  está **aberta e sem assignee desde abril de 2026**. O Dockerfile do repositório da SDF
  carrega o comentário `bazaar not used`.

**PREGÃO é a peça que está faltando** — e o loop inteiro em volta dela, verticalmente
integrado e rodando em testnet.

## O que está aqui

```
seller  ──declara metadata──►  ÍNDICE PREGÃO  ◄──busca em linguagem natural──  agente
   │                                 ▲                                            │
   │                                 │ auto-cataloging via extensão bazaar        │
   └──────────►  FACILITATOR (auto-hospedado)  ◄────── 402 → assina → settle ─────┘
                          │
                    stellar:testnet
```

| Componente | O que é | Requisito do RFP SCF #45 |
|---|---|---|
| `packages/index` | Catálogo + busca híbrida BM25 com ranking explicável, validação de integridade | **3.2** (o pedaço de maior valor do RFP) |
| `apps/facilitator` | Facilitator x402 **auto-hospedado** sobre `@x402/stellar`, taxas patrocinadas | **3.1** |
| `apps/seller` | API paga declarando metadata de discovery, com descrição por parâmetro | **3.2** (seller helpers) |
| `apps/agent` | Servidor MCP + cliente: descobrir → 402 → pagar → consumir | **3.3** |
| `apps/web` | Landing page + console ao vivo com o *lot board* e o loop de pagamento | — |
| `test/` | Suite adversarial de envenenamento de catálogo | **3.2** (integridade), **3.6** |

## Dois blockers, removidos por design

Este projeto foi construído numa janela de poucas horas. As duas coisas que normalmente
travam um setup de x402 em Stellar foram eliminadas — e não por atalho, mas por decisões
que também são **melhores arquiteturalmente**:

**1. Sem faucet, sem captcha.** Em vez de depender do faucet web da Circle para conseguir
USDC de testnet, o PREGÃO **emite seu próprio ativo SEP-41** (`PREGO`) e faz o wrap no SAC.
A spec do scheme `exact` para Stellar aceita qualquer token SEP-41 — USDC é apenas o
default. Resultado: `npm run setup` roda do zero ao fim sem nenhum formulário web.

**2. Sem dependência de facilitator de terceiro.** O facilitator é **auto-hospedado**,
construído sobre o `@x402/stellar` Apache-2.0. Isso remove a dependência do
OpenZeppelin Relayer / OZ Channels — que é **AGPL-3.0-or-later** e, portanto, inviável para
qualquer projeto que precise de licença permissiva — e ao mesmo tempo demonstra o caminho de
*self-facilitation* que o RFP pede em 3.1.

O `FEEPAYER` patrocina as taxas de rede: o agente pagante precisa de **zero XLM**.

## Rodando

```bash
npm install
npm run setup      # gera contas, emite o ativo PREGO, cria trustlines — tudo na testnet
npm run dev:all    # facilitator :4021 · índice :4022 · seller :4023 · web :5173
npm run demo       # loop completo: descobre → 402 → assina → settle → 200
```

Sem chaves de API. Sem captcha. Sem mainnet. Sem dinheiro real.

## Ranking de busca

O RFP SCF #45 afirma que a qualidade da busca é a parte mais difícil do escopo e a que os
catálogos existentes mais deixam por implementar. Concordamos, e por isso o ranking aqui não
é um `.includes()`:

- **BM25** (k1=1.2, b=0.75) sobre um documento com pesos por campo — nome do serviço,
  descrição, tags, nomes e descrições de parâmetros, formato de saída, segmentos da URL.
- **Tokenização PT + EN** — normalização de acentos, stopwords das duas línguas.
- **Sinal de qualidade** — completude da metadata, `log1p(settlements)` e decaimento por
  recência.
- **`_explain` por resultado** — a UI mostra *por que* cada lote ranqueou onde ranqueou.

O problema honesto de cold-start e o método de avaliação proposto (nDCG@10, Recall@20, MRR
sobre um query set rotulado) estão documentados em [`docs/SEARCH-QUALITY.md`](docs/SEARCH-QUALITY.md).

## Integridade do catálogo

O facilitator é uma **fronteira de confiança**. O cliente ecoa o bloco `resource` de volta
dentro do payload de pagamento, então toda metadata de discovery é entrada controlada pelo
atacante. Implementamos as regras de *soft drop* da spec e as testamos adversarialmente:

- `routeTemplate` — a regex normativa `^/[a-zA-Z0-9_/:.\-~%]+$` **permite `%`**, então o
  check de `..` precisa acontecer **após percent-decoding**, inclusive contra
  double-encoding (`%252e%252e`). Testado.
- `iconUrl` — evasões de SSRF: `127.0.0.1`, forma decimal `2130706433`, `[::1]`, `0.0.0.0`,
  `data:`. Testado.
- `serviceName` / `tags` — caracteres de controle, limites de tamanho, dedupe
  case-insensitive, e o invariante que importa: **um campo inválido é descartado, a metadata
  ao redor sobrevive**. Testado.

```bash
npm test
```

## Transações em testnet

Hashes reais produzidos por este código estão em [`docs/TESTNET-TXS.md`](docs/TESTNET-TXS.md),
com links para o explorer.

## Licença

Apache-2.0, público desde o primeiro commit.

---

<div align="center">
Construído em São Paulo para o Stellar Summit SP 2026.
</div>
