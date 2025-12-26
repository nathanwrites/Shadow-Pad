import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ConfidentialERC7984Token, ConfidentialTokenFactory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  creator: HardhatEthersSigner;
  buyer: HardhatEthersSigner;
};

async function deployFixture() {
  const [deployer, creator, buyer] = (await ethers.getSigners()) as unknown as HardhatEthersSigner[];

  const factoryFactory = await ethers.getContractFactory("ConfidentialTokenFactory", deployer);
  const factory = (await factoryFactory.deploy()) as ConfidentialTokenFactory;
  const factoryAddress = await factory.getAddress();

  return { signers: { deployer, creator, buyer }, factory, factoryAddress };
}

describe("Confidential tokens (ERC7984)", function () {
  beforeEach(function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }
  });

  it("creates a token and allows ETH purchases", async function () {
    const { signers, factory } = await deployFixture();

    const totalSupplyClear = 10_000_000n; // 10 tokens with 6 decimals
    const pricePerTokenWei = ethers.parseEther("0.001"); // per 1 token (1e6 units)

    const tokenAddress = await factory
      .connect(signers.creator)
      .createToken.staticCall("MyToken", "MTK", totalSupplyClear, pricePerTokenWei);

    const tx = await factory.connect(signers.creator).createToken("MyToken", "MTK", totalSupplyClear, pricePerTokenWei);
    await tx.wait();

    const token = (await ethers.getContractAt(
      "ConfidentialERC7984Token",
      tokenAddress,
      signers.buyer,
    )) as ConfidentialERC7984Token;

    expect(await token.name()).to.eq("MyToken");
    expect(await token.symbol()).to.eq("MTK");
    expect(await token.totalSupplyClear()).to.eq(totalSupplyClear);
    expect(await token.remainingForSaleClear()).to.eq(totalSupplyClear);

    const buyAmount = 2_000_000n;
    const requiredWei = await token.quoteBuy(buyAmount);
    expect(requiredWei).to.eq(ethers.parseEther("0.002"));

    const buyTx = await token.connect(signers.buyer).buy(buyAmount, { value: requiredWei });
    await buyTx.wait();

    expect(await token.remainingForSaleClear()).to.eq(totalSupplyClear - buyAmount);

    const encryptedBalance = await token.confidentialBalanceOf(signers.buyer.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      await token.getAddress(),
      signers.buyer,
    );
    expect(clearBalance).to.eq(buyAmount);

    expect(await ethers.provider.getBalance(await token.getAddress())).to.eq(requiredWei);

    const creatorBalanceBefore = await ethers.provider.getBalance(signers.creator.address);
    const withdrawTx = await token.connect(signers.creator).withdraw(signers.creator.address, requiredWei);
    const withdrawReceipt = await withdrawTx.wait();
    const withdrawGas = (withdrawReceipt?.gasUsed ?? 0n) * (withdrawReceipt?.gasPrice ?? 0n);

    const creatorBalanceAfter = await ethers.provider.getBalance(signers.creator.address);
    expect(creatorBalanceAfter).to.eq(creatorBalanceBefore + requiredWei - withdrawGas);
    expect(await ethers.provider.getBalance(await token.getAddress())).to.eq(0n);
  });

  it("reverts when trying to buy more than remaining supply", async function () {
    const { signers, factory } = await deployFixture();

    const totalSupplyClear = 1_000_000n;
    const pricePerTokenWei = ethers.parseEther("0.001");

    const tokenAddress = await factory
      .connect(signers.creator)
      .createToken.staticCall("MyToken", "MTK", totalSupplyClear, pricePerTokenWei);
    await (await factory.connect(signers.creator).createToken("MyToken", "MTK", totalSupplyClear, pricePerTokenWei)).wait();

    const token = (await ethers.getContractAt(
      "ConfidentialERC7984Token",
      tokenAddress,
      signers.buyer,
    )) as ConfidentialERC7984Token;

    const tooMuch = totalSupplyClear + 1n;
    await expect(token.connect(signers.buyer).buy(tooMuch, { value: ethers.parseEther("1") })).to.be.reverted;
  });
});
