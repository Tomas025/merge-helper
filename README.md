# merge-helper

[![TypeScript](https://img.shields.io/badge/TypeScript-94.5%25-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Probot](https://img.shields.io/badge/Probot-App-9cf?style=flat-square)](https://probot.github.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg?style=flat-square)](LICENSE)

> O **Merge Helper** é um GitHub App construído com [Probot](https://probot.github.io/) que tem como objetivo principal integrar **ferramentas de merge semi-estruturado** diretamente no fluxo de trabalho de *Pull Requests* do GitHub.

## 💡 Sobre o Projeto

Em ambientes de desenvolvimento complexos, onde merges tradicionais podem ser insuficientes ou propensos a erros, o `merge-helper` atua como um intermediário inteligente. Ele permite a aplicação de lógicas de merge mais sofisticadas e personalizadas, garantindo a integridade e a coerência do código em cenários de integração contínua.

## 🚀 Instalação e Configuração

O `merge-helper` pode ser executado localmente para desenvolvimento ou como um serviço em contêiner utilizando Docker.

### Pré-requisitos

Para rodar o projeto localmente, você precisará dos seguintes itens. O uso do [Docker](https://www.docker.com/) é uma alternativa para evitar a instalação de todas as dependências.

*   [Git](https://git-scm.com/)
*   [Node.js](https://nodejs.org/) (versão 18 ou superior)
*   [npm](https://www.npmjs.com/)
*   [Java](https://www.java.com/pt-br/) (versão 17 ou superior)
*   [Docker](https://www.docker.com/) (opcional, para implantação em contêiner)

### 💻 Execução Local (Desenvolvimento)

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/Tomas025/merge-helper.git
    cd merge-helper
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Construa a aplicação:**
    ```bash
    npm run build
    ```

4.  **Inicie o bot e o processo de configuração:**
    ```bash
    npm start
    ```
    Ao executar o comando, o bot iniciará e você poderá acessar a interface de configuração em `http://localhost:3000`.

5.  **Registre o GitHub App:**
    Acesse `http://localhost:3000` no seu navegador. Você verá a tela de boas-vindas. Clique no botão **"Register Github App"** para iniciar o processo de registro e configuração do seu aplicativo no GitHub.

6.  **Configure as variáveis de ambiente e a Chave Privada:**
    Após o registro do App, você receberá as credenciais necessárias (ID do App, Webhook Secret, etc.). Crie um arquivo `.env` baseado no `.env.example` e preencha com essas credenciais.
    
    **Importante:** Você também receberá a Chave Privada (`.pem`). Substitua o conteúdo do arquivo **`app.private-key.pem`** (localizado na raiz do projeto) pelo conteúdo da chave que você obteve, **mantendo o nome do arquivo original**.

7.  **Reinicie o bot:**
    Com as variáveis de ambiente configuradas, reinicie o bot para que ele comece a operar.
    ```bash
    npm start
    ```

### 🐳 Execução com Docker

Para implantação em produção ou ambientes de teste, o uso de contêineres Docker é recomendado.

1.  **Construa a imagem do contêiner:**
    ```bash
    docker build -t merge-helper .
    ```

2.  **Execute o contêiner:**
    Você deve fornecer o `APP_ID` e a `PRIVATE_KEY` como variáveis de ambiente.
    ```bash
    docker run \
      -e APP_ID=<seu-app-id> \
      -e PRIVATE_KEY=<sua-chave-privada-pem> \
      -e WEBHOOK_SECRET=<seu-webhook-secret> \
      merge-helper
    ```
    *Substitua `<seu-app-id>`, `<sua-chave-privada-pem>` e `<seu-webhook-secret>` pelos valores reais do seu GitHub App.*

## ⚙️ Uso

Após a instalação e configuração como um GitHub App, o `merge-helper` irá monitorar os eventos de *Pull Request* no seu repositório.

**Funcionalidade Principal:**

O aplicativo intervém em Pull Requests para aplicar a lógica de merge semi-estruturado. Detalhes específicos sobre como a lógica de merge é acionada (por exemplo, via comandos de comentário, labels ou status checks) devem ser consultados na documentação interna do projeto ou no código-fonte em `src/`.

## 🤝 Contribuição

Sua contribuição é muito bem-vinda! Se você tiver sugestões de melhoria, quiser relatar um bug ou adicionar novos recursos, por favor, abra uma *issue* ou um *Pull Request*.

## 📄 Licença

Este projeto está licenciado sob a **Licença ISC**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

© 2025 Tomas Braz da Silva
