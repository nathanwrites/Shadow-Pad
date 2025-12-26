import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:tokenFactory:address", "Prints the ConfidentialTokenFactory address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = await deployments.get("ConfidentialTokenFactory");
    console.log("ConfidentialTokenFactory address is " + deployment.address);
  },
);

task("task:tokenFactory:list", "Lists all tokens created via ConfidentialTokenFactory")
  .addOptionalParam("address", "Optionally specify the factory address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("ConfidentialTokenFactory");
    const factory = await ethers.getContractAt("ConfidentialTokenFactory", deployment.address);

    const tokens: string[] = await factory.getAllTokens();
    if (tokens.length === 0) {
      console.log("No tokens created yet.");
      return;
    }
    tokens.forEach((t, i) => console.log(`${i}: ${t}`));
  });

task("task:token:create", "Creates a new confidential ERC7984 token using the factory")
  .addOptionalParam("factory", "Optionally specify the factory address")
  .addParam("name", "Token name")
  .addParam("symbol", "Token symbol")
  .addOptionalParam("supply", "Total supply (uint64, base units, default 100000000000)", "100000000000")
  .addOptionalParam("price", "Price per 1 token (ETH), default 0.0001", "0.0001")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;

    const deployment = taskArguments.factory ? { address: taskArguments.factory } : await deployments.get("ConfidentialTokenFactory");
    const [signer] = await ethers.getSigners();
    const factory = await ethers.getContractAt("ConfidentialTokenFactory", deployment.address, signer);

    const supply = BigInt(taskArguments.supply);
    const pricePerTokenWei = ethers.parseEther(taskArguments.price);

    const predicted = await factory.createToken.staticCall(taskArguments.name, taskArguments.symbol, supply, pricePerTokenWei);
    const tx = await factory.createToken(taskArguments.name, taskArguments.symbol, supply, pricePerTokenWei);
    console.log(`Wait for tx:${tx.hash}... token=${predicted}`);
    await tx.wait();
  });

task("task:token:buy", "Buys a token using ETH (amount is base units, uint64)")
  .addParam("token", "Token address")
  .addParam("amount", "Amount to buy (uint64, base units)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers } = hre;
    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("ConfidentialERC7984Token", taskArguments.token, signer);

    const amount = BigInt(taskArguments.amount);
    const requiredWei: bigint = await token.quoteBuy(amount);

    const tx = await token.buy(amount, { value: requiredWei });
    console.log(`Wait for tx:${tx.hash}... requiredWei=${requiredWei}`);
    await tx.wait();
  });

task("task:token:decrypt-balance", "Decrypts a user's confidential token balance (view + user decryption)")
  .addParam("token", "Token address")
  .addOptionalParam("user", "User address (defaults to signer[0])")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signers = await ethers.getSigners();
    const signer = signers[0];
    const user = (taskArguments.user as string | undefined) ?? signer.address;

    const token = await ethers.getContractAt("ConfidentialERC7984Token", taskArguments.token);
    const encryptedBalance = await token.confidentialBalanceOf(user);

    if (encryptedBalance === ethers.ZeroHash) {
      console.log(`encrypted balance: ${encryptedBalance}`);
      console.log("clear balance    : 0");
      return;
    }

    const clearBalance = await fhevm.userDecryptEuint(FhevmType.euint64, encryptedBalance, taskArguments.token, signer);
    console.log(`encrypted balance: ${encryptedBalance}`);
    console.log(`clear balance    : ${clearBalance}`);
  });

