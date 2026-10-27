# Reserva Fácil — Colégio Augustus

App web (mobile-first) para reservar salas e equipamentos do Colégio Augustus, com modo offline e painel do responsável.

**No ar:** https://leletdecopas.github.io/reserva-facil-augustus/

## Funcionalidades

- Tela **Início** com atalhos (sem barra inferior, para não repetir as opções)
- **Novo Agendamento** em 3 passos (solicitante, data/horário, espaço + equipamentos)
- **Salas**: 6º Ano A/C, 7º Ano A/C, 8º Ano, 9º Ano, 1ª, 2ª e 3ª Série (+ "Nenhum, só equipamento")
- **Itens**: Data Show (3), Notebook (3), Caixa de som Bluetooth, Extensão, Cabo HDMI e Carregador da caixa de som (1 cada) — **quantidades editáveis na aba `Estoque` da planilha**
- **Bloqueio por quantidade**: reserva é bloqueada só quando **não há item livre** no horário (ex.: 3 de 3 Data Shows ocupados); a mensagem informa quantos já estão reservados e de quando é possível agendar
- **Linha do tempo de disponibilidade** (Passo 3) em 3 tons: **livre** (clique preenche), **parcial** (ex.: `1/3`, clicável) e **ocupado** (`3/3`)
- **Meus Agendamentos** com cancelamento (que libera o horário e o item na nuvem)
- **Avaliações** (estrelas + comentário) enviadas para a planilha
- **Área do Responsável** (senha) com totais, média de notas, listas e **cancelamento de reservas pelo painel**
- **Offline**: após a primeira visita, o app abre sem internet (os dados antigos ficam no aparelho)

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | App completo (interface + lógica) |
| `config.js` | URL da API (Google Apps Script) |
| `sw.js` | Service Worker (cache offline) |
| `apps-script/Code.gs` | Backend: cola no Google Apps Script |
| `logo-augustus.png` | Logo com fundo transparente |
| `QR Code - Reserva Fácil.jpg` | QR Code para abrir o app no celular |

## Configurar a nuvem (passo a passo)

> Sem esses passos, o app funciona apenas local (reserva fica salva no aparelho e não há bloqueio de conflito entre pessoas).

1. **Crie uma planilha** no Google Drive chamada, por exemplo, `Reserva Fácil - Dados` (as abas `Reservas`, `Avaliacoes` e `Estoque` são criadas automaticamente — a `Estoque` vem semeada com as quantidades padrão).

2. Com a planilha aberta, acesse **Extensões → Apps Script**.

3. Apague o conteúdo padrão e **cole todo o conteúdo de `apps-script/Code.gs`** deste repositório. Salve (Ctrl+S).

4. **Defina a senha do responsável**: em **Projeto (engrenagem) → Configurações do projeto → Propriedades de scripts**, adicione a propriedade:
   - Nome: `ADMIN_SENHA`
   - Valor: a senha que você quiser
   - Clique em **Salvar propriedades**.

5. **Implante o app da web**: clique em **Implantar → Nova implantação**:
   - Tipo: **Aplicativo da web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
   - Clique em **Implantar** e **copie a URL** gerada (termina com `/exec`).

6. **Cole a URL no `config.js`** deste repositório:
   ```js
   window.APP_CONFIG = {
     API_URL: "https://script.google.com/macros/s/.../exec"
   };
   ```

7. **Publique** as alterações (commit + push). Pronto: reservas, conflitos, cancelamentos e avaliações passam a ir para a planilha.

## Área do responsável

- No app: tela **Início** → link discreto **Área do Responsável** (no rodapé da tela) → digite a senha definida no passo 4.
- Lá você vê: total de reservas, confirmadas, avaliações e média de estrelas, além das listas completas — e pode **cancelar reservas** (botão em cada reserva confirmada; o cancelamento libera o horário e o item na hora).
- Para o controle bruto (filtrar, imprimir, gráficos), abra a própria planilha. Para mudar as quantidades dos itens, edite a aba **`Estoque`** (coluna `Quantidade`).

## Observações

- Reservas/avaliações feitas **antes** de configurar a nuvem ficam salvas apenas no aparelho de quem fez (não migram automaticamente).
- O bloqueio considera **espaço** (1 por horário) e **itens por quantidade** (só bloqueia quando todos estão em uso no horário pedido). Sobreposição de início/fim.
- Item que não existir na aba `Estoque` é tratado como quantidade 1; quantidade `0` bloqueia o item totalmente.
- A senha do responsável é verificada no servidor (propriedade do script); não fica embutida no app.
- Para atualizar o app no ar: altere, faça commit e push — o GitHub Pages publica sozinho em ~1 minuto. Ao mudar o `sw.js`/`index.html`, aumente a versão do cache em `sw.js` (`reserva-facil-vN`) para os celulares atualizarem. Após colar o `Code.gs` novo no Apps Script, **reimplante o app** (Implantar → Editar implantação → Nova versão) para a URL continuar a mesma.
