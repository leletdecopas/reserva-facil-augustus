# Reserva Fácil — Colégio Augustus

App web (mobile-first) para reservar salas e equipamentos do Colégio Augustus, com modo offline e painel do responsável.

**No ar:** https://leletdecopas.github.io/reserva-facil-augustus/

## Funcionalidades

- Tela **Início** com atalhos (sem barra inferior, para não repetir as opções)
- **Novo Agendamento** em 3 passos (solicitante, data/horário, espaço + equipamentos)
- **Bloqueio de conflito**: mesma sala ou mesmo equipamento não pode ser reservado duas vezes no mesmo horário
- **Mensagem amigável de conflito**: informa o horário da reserva existente e **de quando é possível agendar** (ex.: *"Já existe uma reserva das 08:00 às 09:00 feita por outro usuário. Você poderá agendar a partir das 09:00."*)
- **Linha do tempo de disponibilidade** (Passo 3): mostra as janelas ocupadas e livres do dia para o espaço e os equipamentos escolhidos — **toque numa faixa clara** para preencher os horários automaticamente
- **Meus Agendamentos** com cancelamento (que libera o horário na nuvem)
- **Avaliações** (estrelas + comentário) enviadas para a planilha
- **Área do Responsável** (senha) com totais, média de notas, lista de reservas e avaliações
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

1. **Crie uma planilha** no Google Drive chamada, por exemplo, `Reserva Fácil - Dados` (as abas `Reservas` e `Avaliacoes` são criadas automaticamente).

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
- Lá você vê: total de reservas, confirmadas, avaliações e média de estrelas, além das listas completas.
- Para o controle bruto (filtrar, imprimir, gráficos), abra a própria planilha.

## Observações

- Reservas/avaliações feitas **antes** de configurar a nuvem ficam salvas apenas no aparelho de quem fez (não migram automaticamente).
- O bloqueio de conflito considera **espaço** e **equipamentos** no mesmo horário (sobreposição de início/fim).
- A senha do responsável é verificada no servidor (propriedade do script); não fica embutida no app.
- Para atualizar o app no ar: altere, faça commit e push — o GitHub Pages publica sozinho em ~1 minuto. Ao mudar o `sw.js`/`index.html`, aumente a versão do cache em `sw.js` (`reserva-facil-vN`) para os celulares atualizarem.
